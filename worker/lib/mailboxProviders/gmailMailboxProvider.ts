import { google } from 'googleapis'
import type { MailAccount } from '@prisma/client'
import { decrypt, encrypt } from '~/lib/encryption'
import { prisma } from '~/lib/prisma'
import type { MailboxFolder, MailboxMessageRecord, MailboxProvider, MailboxStoredMessageRef } from '~/lib/mailboxProviders/types'
import { extractEmailAddress, safeDate, uniqByProviderMessageId } from '~/lib/mailboxProviders/utils'
import {
  hasGmailImapSmtpAccess,
  listRecentGmailImapMessages,
  markGmailImapMessageAsRead,
  rescueGmailImapMessageToInbox,
  sendGmailImapReply,
} from '~/lib/gmailImapMailbox'

type GmailFolderConfig = {
  id: string
  name: string
  kind: MailboxFolder['kind']
  labelIds: string[]
}

const FOLDERS: GmailFolderConfig[] = [
  { id: 'gmail-inbox', name: 'Inbox', kind: 'INBOX', labelIds: ['INBOX'] },
  { id: 'gmail-spam', name: 'Spam', kind: 'SPAM', labelIds: ['SPAM'] },
  { id: 'gmail-sent', name: 'Sent', kind: 'SENT', labelIds: ['SENT'] },
]

export function isGmailMailboxPermissionError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error).toLowerCase()
  return (
    message.includes('insufficient permission') ||
    message.includes('request had insufficient authentication scopes') ||
    message.includes('forbidden')
  )
}

async function createGmailClient(account: MailAccount) {
  if (account.type !== 'gmail') {
    throw new Error(`Mailbox provider mismatch for ${account.email}`)
  }
  if (!account.accessToken || !account.refreshToken) {
    throw new Error(`Gmail tokens missing for ${account.email}`)
  }

  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000'
  const redirectUri = `${baseUrl}/api/mail-accounts/gmail/callback`
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  )

  const isExpired = !account.tokenExpiry || account.tokenExpiry < new Date()
  if (isExpired) {
    client.setCredentials({ refresh_token: account.refreshToken })
    const { credentials } = await client.refreshAccessToken()
    const newToken = credentials.access_token
    if (!newToken) throw new Error(`Failed to refresh Gmail token for ${account.email}`)

    await prisma.mailAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encrypt(newToken),
        tokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        mailboxSyncError: null,
      },
    })
    client.setCredentials({ access_token: newToken, refresh_token: account.refreshToken })
  } else {
    client.setCredentials({
      access_token: decrypt(account.accessToken),
      refresh_token: account.refreshToken,
    })
  }

  return google.gmail({ version: 'v1', auth: client })
}

export class GmailMailboxProvider implements MailboxProvider {
  providerName = 'gmail' as const

  constructor(private readonly account: MailAccount) {}

  async listFolders(): Promise<MailboxFolder[]> {
    if (hasGmailImapSmtpAccess(this.account)) {
      return [
        { id: 'gmail-inbox', name: 'Inbox', kind: 'INBOX' },
        { id: 'gmail-spam', name: 'Spam', kind: 'SPAM' },
        { id: 'gmail-sent', name: 'Sent', kind: 'SENT' },
      ]
    }
    return FOLDERS.map(({ id, name, kind }) => ({ id, name, kind }))
  }

  async listRecentMessages(options: { days?: number; limitPerFolder?: number } = {}): Promise<MailboxMessageRecord[]> {
    if (hasGmailImapSmtpAccess(this.account)) {
      return listRecentGmailImapMessages(this.account, options)
    }

    const gmail = await createGmailClient(this.account)
    const days = Math.max(1, options.days ?? 7)
    const limitPerFolder = Math.max(1, options.limitPerFolder ?? 25)
    const query = `newer_than:${days}d`
    const output: MailboxMessageRecord[] = []

    for (const folder of FOLDERS) {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        maxResults: limitPerFolder,
        labelIds: folder.labelIds,
        q: query,
      })

      for (const item of listRes.data.messages ?? []) {
        if (!item.id) continue
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: item.id,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date', 'Message-ID', 'In-Reply-To', 'References'],
        })

        const payload = detail.data.payload
        const headers = new Map(
          (payload?.headers ?? []).map((header) => [header.name?.toLowerCase() ?? '', header.value ?? ''])
        )
        const labelIds = detail.data.labelIds ?? []
        const internalDate = detail.data.internalDate ? new Date(Number(detail.data.internalDate)) : null
        output.push({
          providerMessageId: detail.data.id || item.id,
          providerThreadId: detail.data.threadId,
          folderName: folder.name,
          folderKind: folder.kind,
          direction: folder.kind === 'SENT' ? 'outbound' : 'inbound',
          fromEmail: extractEmailAddress(headers.get('from')),
          toEmail: extractEmailAddress(headers.get('to')),
          subject: headers.get('subject') || detail.data.snippet || null,
          snippet: detail.data.snippet || null,
          sentAt: safeDate(headers.get('date')) || internalDate,
          receivedAt: internalDate,
          messageIdHeader: headers.get('message-id') || null,
          inReplyToHeader: headers.get('in-reply-to') || null,
          referencesHeader: headers.get('references') || null,
          isRead: !labelIds.includes('UNREAD'),
          isStarred: labelIds.includes('STARRED'),
          isSpam: labelIds.includes('SPAM') || folder.kind === 'SPAM',
          metadata: { labelIds },
        })
      }
    }

    return uniqByProviderMessageId(output)
  }

  async markAsRead(message: MailboxStoredMessageRef): Promise<void> {
    if (hasGmailImapSmtpAccess(this.account)) {
      await markGmailImapMessageAsRead(this.account, message)
      return
    }

    const gmail = await createGmailClient(this.account)
    await gmail.users.messages.modify({
      userId: 'me',
      id: message.providerMessageId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    })
  }

  async rescueToInbox(message: MailboxStoredMessageRef): Promise<void> {
    if (hasGmailImapSmtpAccess(this.account)) {
      await rescueGmailImapMessageToInbox(this.account, message)
      return
    }

    const gmail = await createGmailClient(this.account)
    await gmail.users.messages.modify({
      userId: 'me',
      id: message.providerMessageId,
      requestBody: {
        addLabelIds: ['INBOX', 'IMPORTANT'],
        removeLabelIds: ['SPAM', 'UNREAD'],
      },
    })
  }

  async sendReply(message: MailboxStoredMessageRef, reply: { subject: string; html: string }): Promise<void> {
    if (hasGmailImapSmtpAccess(this.account)) {
      await sendGmailImapReply(this.account, message, reply)
      return
    }

    const gmail = await createGmailClient(this.account)
    const to = message.fromEmail || message.toEmail
    if (!to) throw new Error(`Reply target missing for Gmail mailbox ${this.account.email}`)

    const references = [message.referencesHeader, message.messageIdHeader].filter(Boolean).join(' ').trim()
    const raw = [
      `From: "${this.account.displayName}" <${this.account.email}>`,
      `To: ${to}`,
      `Subject: ${reply.subject}`,
      ...(message.messageIdHeader ? [`In-Reply-To: ${message.messageIdHeader}`] : []),
      ...(references ? [`References: ${references}`] : []),
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      reply.html,
    ].join('\n')

    const encoded = Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encoded,
        threadId: message.providerThreadId || undefined,
      },
    })
  }
}
