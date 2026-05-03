import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { MailAccount } from '@prisma/client'
import type { MailboxFolder, MailboxMessageRecord, MailboxStoredMessageRef } from '~/lib/mailboxProviders/types'
import { decrypt } from '~/lib/encryption'
import { uniqByProviderMessageId } from '~/lib/mailboxProviders/utils'

type ImapFolderInfo = {
  path: string
  name: string
  specialUse: string | null
  kind: MailboxFolder['kind']
}

function normalizeFolderPath(path: string) {
  return path.trim()
}

function resolveFolderKind(path: string, specialUse?: string | null): MailboxFolder['kind'] {
  const normalized = `${specialUse || ''} ${path}`.toLowerCase()
  if (normalized.includes('\\junk') || normalized.includes('spam') || normalized.includes('junk')) return 'SPAM'
  if (normalized.includes('\\sent') || normalized.includes('sent')) return 'SENT'
  if (normalized.includes('\\inbox') || normalized === 'inbox') return 'INBOX'
  if (normalized.includes('archive') || normalized.includes('\\archive')) return 'ARCHIVE'
  return 'OTHER'
}

function decodePassword(account: Pick<MailAccount, 'smtpPassword'>) {
  if (!account.smtpPassword) throw new Error('Gmail app password missing')
  return decrypt(account.smtpPassword)
}

function parseUid(metadata: Record<string, unknown> | null | undefined) {
  const rawUid = metadata && typeof metadata.uid === 'number'
    ? metadata.uid
    : metadata && typeof metadata.uid === 'string'
      ? Number(metadata.uid)
      : NaN
  if (!Number.isFinite(rawUid) || rawUid <= 0) {
    throw new Error('IMAP UID missing')
  }
  return rawUid
}

function parseFolderPath(metadata: Record<string, unknown> | null | undefined) {
  const folderPath = metadata && typeof metadata.folderPath === 'string' ? normalizeFolderPath(metadata.folderPath) : ''
  if (!folderPath) throw new Error('IMAP folder path missing')
  return folderPath
}

function normalizeSnippet(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, 220) || null
}

function addressFromParsed(value: any) {
  return value?.value?.[0]?.address || null
}

async function withImapClient<T>(
  account: Pick<MailAccount, 'email' | 'imapHost' | 'imapPort' | 'imapSecure' | 'smtpPassword'>,
  action: (client: ImapFlow) => Promise<T>
) {
  if (!account.imapHost || !account.imapPort || !account.smtpPassword) {
    throw new Error(`Gmail IMAP settings are incomplete for ${account.email}`)
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: {
      user: account.email,
      pass: decodePassword(account),
    },
    logger: false,
  })

  await client.connect()
  try {
    return await action(client)
  } finally {
    await client.logout().catch(() => undefined)
  }
}

async function listFolders(client: ImapFlow): Promise<ImapFolderInfo[]> {
  const entries = await client.list()
  return entries.map((entry: any) => ({
    path: normalizeFolderPath(entry.path),
    name: entry.name || entry.path,
    specialUse: typeof entry.specialUse === 'string' ? entry.specialUse : null,
    kind: resolveFolderKind(entry.path, entry.specialUse),
  }))
}

async function findInboxFolder(client: ImapFlow) {
  const folders = await listFolders(client)
  return folders.find((entry) => entry.kind === 'INBOX') || { path: 'INBOX', name: 'Inbox', specialUse: '\\Inbox', kind: 'INBOX' as const }
}

export function hasGmailImapSmtpAccess(
  account: Pick<MailAccount, 'type' | 'smtpHost' | 'smtpPort' | 'smtpPassword' | 'imapHost' | 'imapPort'>
) {
  return (
    account.type === 'gmail' &&
    Boolean(account.smtpHost && account.smtpPort && account.smtpPassword && account.imapHost && account.imapPort)
  )
}

export async function listRecentGmailImapMessages(
  account: Pick<MailAccount, 'type' | 'email' | 'imapHost' | 'imapPort' | 'imapSecure' | 'smtpPassword'>,
  options: { days?: number; limitPerFolder?: number } = {}
): Promise<MailboxMessageRecord[]> {
  const limitPerFolder = Math.max(1, options.limitPerFolder ?? 25)
  const cutoff = Date.now() - Math.max(1, options.days ?? 7) * 24 * 60 * 60 * 1000

  return withImapClient(account, async (client) => {
    const folders = await listFolders(client)
    const interesting = folders.filter((folder) => ['INBOX', 'SPAM', 'SENT'].includes(folder.kind))
    const records: MailboxMessageRecord[] = []

    for (const folder of interesting) {
      const lock = await client.getMailboxLock(folder.path)
      try {
        const exists = client.mailbox ? client.mailbox.exists || 0 : 0
        if (!exists) continue

        const startSeq = Math.max(1, exists - limitPerFolder + 1)
        for await (const message of client.fetch(`${startSeq}:*`, { uid: true, envelope: true, flags: true, internalDate: true, source: true })) {
          const internalDate = message.internalDate instanceof Date ? message.internalDate : null
          if (internalDate && internalDate.getTime() < cutoff) continue

          const source = message.source ? Buffer.from(message.source) : null
          const parsed = source ? await simpleParser(source) : null
          const fromEmail = addressFromParsed(parsed?.from) || message.envelope?.from?.[0]?.address || null
          const toEmail = addressFromParsed(parsed?.to) || message.envelope?.to?.[0]?.address || null
          const subject = parsed?.subject || message.envelope?.subject || null
          const text = typeof parsed?.text === 'string' ? parsed.text : null
          const html = typeof parsed?.html === 'string' ? parsed.html : null
          const snippet = normalizeSnippet(text || html)
          const messageIdHeader = parsed?.messageId || null
          const referencesHeader = Array.isArray(parsed?.references)
            ? parsed.references.join(' ')
            : typeof parsed?.references === 'string'
              ? parsed.references
              : null
          const inReplyToHeader = parsed?.inReplyTo || null
          const flags = message.flags instanceof Set ? Array.from(message.flags) : []

          records.push({
            providerMessageId: `${folder.path}::${message.uid}`,
            providerThreadId: referencesHeader || messageIdHeader || `${folder.path}::${message.uid}`,
            folderName: folder.name,
            folderKind: folder.kind,
            direction: folder.kind === 'SENT' ? 'outbound' : 'inbound',
            fromEmail,
            toEmail,
            subject,
            snippet,
            sentAt: parsed?.date || internalDate,
            receivedAt: internalDate,
            messageIdHeader,
            inReplyToHeader,
            referencesHeader,
            isRead: flags.includes('\\Seen'),
            isStarred: flags.includes('\\Flagged'),
            isSpam: folder.kind === 'SPAM',
            metadata: {
              folderPath: folder.path,
              uid: message.uid,
              specialUse: folder.specialUse,
            },
          })
        }
      } finally {
        lock.release()
      }
    }

    return uniqByProviderMessageId(records)
  })
}

export async function markGmailImapMessageAsRead(
  account: Pick<MailAccount, 'email' | 'imapHost' | 'imapPort' | 'imapSecure' | 'smtpPassword'>,
  message: MailboxStoredMessageRef
) {
  const folderPath = parseFolderPath(message.metadata)
  const uid = parseUid(message.metadata)

  await withImapClient(account, async (client) => {
    const lock = await client.getMailboxLock(folderPath)
    try {
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
    } finally {
      lock.release()
    }
  })
}

export async function rescueGmailImapMessageToInbox(
  account: Pick<MailAccount, 'email' | 'imapHost' | 'imapPort' | 'imapSecure' | 'smtpPassword'>,
  message: MailboxStoredMessageRef
) {
  const folderPath = parseFolderPath(message.metadata)
  const uid = parseUid(message.metadata)

  await withImapClient(account, async (client) => {
    const inbox = await findInboxFolder(client)
    const lock = await client.getMailboxLock(folderPath)
    let activeUid = uid
    try {
      if (normalizeFolderPath(folderPath).toLowerCase() !== normalizeFolderPath(inbox.path).toLowerCase()) {
        const moved: any = await client.messageMove(uid, inbox.path, { uid: true })
        activeUid = moved?.uidMap?.get?.(uid) ?? activeUid
      }
    } finally {
      lock.release()
    }

    const inboxLock = await client.getMailboxLock(inbox.path)
    try {
      await client.messageFlagsAdd(activeUid, ['\\Seen', '\\Flagged'], { uid: true })
    } finally {
      inboxLock.release()
    }
  })
}

export async function sendGmailImapReply(
  account: Pick<MailAccount, 'displayName' | 'email' | 'smtpHost' | 'smtpPort' | 'smtpPassword'>,
  message: MailboxStoredMessageRef,
  reply: { subject: string; html: string }
) {
  if (!account.smtpHost || !account.smtpPort || !account.smtpPassword) {
    throw new Error(`Gmail SMTP settings are incomplete for ${account.email}`)
  }

  const to = message.fromEmail || message.toEmail
  if (!to) throw new Error(`Reply target missing for Gmail mailbox ${account.email}`)

  const references = [message.referencesHeader, message.messageIdHeader].filter(Boolean).join(' ').trim()
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpPort === 465,
    auth: {
      user: account.email,
      pass: decodePassword(account),
    },
  })

  const info = await transporter.sendMail({
    from: `"${account.displayName}" <${account.email}>`,
    to,
    subject: reply.subject,
    html: reply.html,
    headers: {
      ...(message.messageIdHeader ? { 'In-Reply-To': message.messageIdHeader } : {}),
      ...(references ? { References: references } : {}),
    },
  })

  return {
    providerMessageId: info.messageId || info.response || null,
  }
}
