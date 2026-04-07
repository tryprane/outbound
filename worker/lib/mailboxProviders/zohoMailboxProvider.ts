import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import type { MailAccount } from '@prisma/client'
import { decrypt } from '~/lib/encryption'
import type { MailboxFolder, MailboxFolderKind, MailboxMessageRecord, MailboxProvider, MailboxStoredMessageRef } from '~/lib/mailboxProviders/types'
import { extractEmailAddress, safeDate, uniqByProviderMessageId } from '~/lib/mailboxProviders/utils'
import {
  getZohoFolders,
  listZohoMessages,
  mapZohoFolderKind,
  mapZohoMessageRecord,
  markZohoMessagesAsNotSpam,
  markZohoMessagesAsRead,
  moveZohoMessages,
  sendZohoReply,
} from '~/lib/zohoMailApi'

export function inferZohoImapHost(smtpHost?: string | null): string {
  const normalized = smtpHost?.toLowerCase() || ''
  if (normalized.includes('.zoho.in')) return 'imap.zoho.in'
  if (normalized.includes('.zoho.eu')) return 'imap.zoho.eu'
  return 'imap.zoho.com'
}

export function isZohoImapDisabledError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error).toLowerCase()
  const response = typeof error === 'object' && error && 'response' in error ? String((error as { response?: unknown }).response ?? '').toLowerCase() : ''
  return (
    message.includes('enable imap') ||
    response.includes('enable imap') ||
    response.includes('you are yet to enable imap')
  )
}

function inferFolderKind(mailbox: { path: string; specialUse?: string | null }): MailboxFolderKind {
  const path = mailbox.path.toLowerCase()
  const specialUse = mailbox.specialUse?.toLowerCase()
  if (specialUse === '\\inbox' || path === 'inbox') return 'INBOX'
  if (specialUse === '\\junk' || specialUse === '\\spam' || path.includes('spam') || path.includes('junk')) return 'SPAM'
  if (specialUse === '\\sent' || path.includes('sent')) return 'SENT'
  if (specialUse === '\\archive' || path.includes('archive')) return 'ARCHIVE'
  return 'OTHER'
}

function firstAddress(addresses?: Array<{ name?: string | null; address?: string | null }>): string | null {
  const first = addresses?.[0]
  if (!first) return null
  const combined = first.address ? `${first.name ? `${first.name} ` : ''}<${first.address}>` : first.name ?? null
  return extractEmailAddress(combined)
}

export class ZohoMailboxProvider implements MailboxProvider {
  providerName = 'zoho' as const

  constructor(private readonly account: MailAccount) {}

  private shouldUseApi() {
    return this.account.zohoMailboxMode === 'api' || Boolean(this.account.zohoRefreshToken && this.account.zohoAccountId)
  }

  async listFolders(): Promise<MailboxFolder[]> {
    if (this.shouldUseApi()) {
      const folders = await getZohoFolders(this.account)
      return folders.map((folder) => ({
        id: folder.folderId,
        name: folder.folderName,
        kind: mapZohoFolderKind(folder),
      }))
    }

    const client = await this.connect()
    try {
      const mailboxes = await client.list()
      return mailboxes.map((mailbox) => ({
        id: mailbox.path,
        name: mailbox.name,
        kind: inferFolderKind(mailbox),
      }))
    } finally {
      await client.logout().catch(() => {})
    }
  }

  async listRecentMessages(options: { days?: number; limitPerFolder?: number } = {}): Promise<MailboxMessageRecord[]> {
    if (this.shouldUseApi()) {
      const folders = await getZohoFolders(this.account)
      const interesting = folders.filter((folder) => {
        const kind = mapZohoFolderKind(folder)
        return kind === 'INBOX' || kind === 'SPAM' || kind === 'SENT'
      })
      const limitPerFolder = Math.max(1, options.limitPerFolder ?? 25)
      const result: MailboxMessageRecord[] = []
      for (const folder of interesting) {
        const kind = mapZohoFolderKind(folder)
        const messages = await listZohoMessages(this.account, {
          folderId: folder.folderId,
          limit: limitPerFolder,
          includesent: kind === 'SENT',
        })
        for (const message of messages) {
          result.push(mapZohoMessageRecord(message, folder, kind))
        }
      }
      return uniqByProviderMessageId(result)
    }

    const client = await this.connect()
    const days = Math.max(1, options.days ?? 7)
    const limitPerFolder = Math.max(1, options.limitPerFolder ?? 25)
    try {
      const mailboxes = await client.list()
      const interesting = mailboxes.filter((mailbox) => {
        const kind = inferFolderKind(mailbox)
        return kind === 'INBOX' || kind === 'SPAM' || kind === 'SENT'
      })
      const result: MailboxMessageRecord[] = []
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

      for (const mailbox of interesting) {
        const kind = inferFolderKind(mailbox)
        await client.mailboxOpen(mailbox.path, { readOnly: true })
        const uids = (await client.search({ since })) || []
        const recentUids = uids.slice(-limitPerFolder)
        if (recentUids.length === 0) continue
        for await (const message of client.fetch(recentUids, {
          uid: true,
          flags: true,
          envelope: true,
          internalDate: true,
          source: false,
        })) {
          result.push({
            providerMessageId: `${mailbox.path}:${message.uid}`,
            providerThreadId: message.envelope?.messageId || null,
            folderName: mailbox.name,
            folderKind: kind,
            direction: kind === 'SENT' ? 'outbound' : 'inbound',
            fromEmail: firstAddress(message.envelope?.from),
            toEmail: firstAddress(message.envelope?.to),
            subject: message.envelope?.subject || null,
            snippet: message.envelope?.subject || null,
            sentAt: safeDate(message.envelope?.date) || safeDate(message.internalDate),
            receivedAt: safeDate(message.internalDate),
            messageIdHeader: message.envelope?.messageId || null,
            inReplyToHeader: null,
            referencesHeader: null,
            isRead: Boolean(message.flags?.has('\\Seen')),
            isStarred: Boolean(message.flags?.has('\\Flagged')),
            isSpam: kind === 'SPAM',
            metadata: {
              mailboxPath: mailbox.path,
              uid: message.uid,
              flags: Array.from(message.flags ?? []),
            },
          })
        }
      }

      return uniqByProviderMessageId(result)
    } finally {
      await client.logout().catch(() => {})
    }
  }

  async markAsRead(message: MailboxStoredMessageRef): Promise<void> {
    if (this.shouldUseApi()) {
      await markZohoMessagesAsRead(this.account, [message.providerMessageId])
      return
    }

    const target = this.parseStoredMessageRef(message)
    const client = await this.connect()
    try {
      await client.mailboxOpen(target.mailboxPath)
      await client.messageFlagsAdd(target.uid, ['\\Seen'], { uid: true })
    } finally {
      await client.logout().catch(() => {})
    }
  }

  async rescueToInbox(message: MailboxStoredMessageRef): Promise<void> {
    if (this.shouldUseApi()) {
      const folderId = typeof message.metadata?.folderId === 'string' ? message.metadata.folderId : null
      const folders = await getZohoFolders(this.account)
      const inbox = folders.find((folder) => mapZohoFolderKind(folder) === 'INBOX')
      if (!inbox) {
        throw new Error(`Inbox folder not found for ${this.account.email}`)
      }
      if (folderId !== inbox.folderId) {
        await moveZohoMessages(this.account, [message.providerMessageId], inbox.folderId)
      }
      await markZohoMessagesAsNotSpam(this.account, [message.providerMessageId])
      await markZohoMessagesAsRead(this.account, [message.providerMessageId])
      return
    }

    const target = this.parseStoredMessageRef(message)
    const client = await this.connect()
    try {
      await client.mailboxOpen(target.mailboxPath)
      await client.messageMove(target.uid, 'INBOX', { uid: true })
    } finally {
      await client.logout().catch(() => {})
    }
  }

  async sendReply(message: MailboxStoredMessageRef, reply: { subject: string; html: string }): Promise<void> {
    if (this.shouldUseApi()) {
      const to = message.fromEmail || message.toEmail
      if (!to) throw new Error(`Reply target missing for Zoho mailbox ${this.account.email}`)
      await sendZohoReply(this.account, message.providerMessageId, {
        toAddress: to,
        subject: reply.subject,
        content: reply.html,
      })
      return
    }

    if (!this.account.smtpPassword) {
      throw new Error(`Zoho credentials missing for ${this.account.email}`)
    }
    const to = message.fromEmail || message.toEmail
    if (!to) throw new Error(`Reply target missing for Zoho mailbox ${this.account.email}`)

    const transporter = nodemailer.createTransport({
      host: this.account.smtpHost || 'smtp.zoho.com',
      port: this.account.smtpPort || 465,
      secure: (this.account.smtpPort || 465) === 465,
      auth: {
        user: this.account.email,
        pass: decrypt(this.account.smtpPassword),
      },
    })

    const references = [message.referencesHeader, message.messageIdHeader].filter(Boolean).join(' ').trim()
    await transporter.sendMail({
      from: `"${this.account.displayName}" <${this.account.email}>`,
      to,
      subject: reply.subject,
      html: reply.html,
      headers: {
        ...(message.messageIdHeader ? { 'In-Reply-To': message.messageIdHeader } : {}),
        ...(references ? { References: references } : {}),
      },
    })
  }

  private async connect() {
    if (this.account.type !== 'zoho') {
      throw new Error(`Mailbox provider mismatch for ${this.account.email}`)
    }
    if (this.shouldUseApi()) {
      throw new Error(`Zoho IMAP connection requested for API mailbox ${this.account.email}`)
    }
    if (!this.account.smtpPassword) {
      throw new Error(`Zoho credentials missing for ${this.account.email}`)
    }

    const client = new ImapFlow({
      host: this.account.imapHost || inferZohoImapHost(this.account.smtpHost),
      port: this.account.imapPort || 993,
      secure: this.account.imapSecure ?? true,
      auth: {
        user: this.account.email,
        pass: decrypt(this.account.smtpPassword),
      },
      logger: false,
    })

    await client.connect()
    return client
  }

  private parseStoredMessageRef(message: MailboxStoredMessageRef) {
    const mailboxPath = typeof message.metadata?.mailboxPath === 'string'
      ? message.metadata.mailboxPath
      : message.providerMessageId.split(':')[0]
    const rawUid = typeof message.metadata?.uid === 'number'
      ? message.metadata.uid
      : Number.parseInt(message.providerMessageId.split(':').slice(-1)[0] || '', 10)

    if (!mailboxPath || !Number.isFinite(rawUid)) {
      throw new Error(`Zoho mailbox metadata missing for ${this.account.email}`)
    }

    return {
      mailboxPath,
      uid: rawUid,
    }
  }
}
