import { google } from 'googleapis'
import type { MailAccount } from '@prisma/client'
import { decrypt } from '@/lib/encryption'
import { getGmailClient } from '@/lib/mailer/gmail'
import {
  hasGmailImapSmtpAccess,
  markGmailImapMessageAsRead,
  rescueGmailImapMessageToInbox,
  sendGmailImapReply,
} from '@/lib/gmailImapMailbox'
import {
  getZohoFolders,
  mapZohoFolderKind,
  markZohoMessagesAsNotSpam,
  markZohoMessagesAsRead,
  moveZohoMessages,
  sendZohoReply,
} from '@/lib/zohoMailApi'

type MailboxMessageRef = {
  providerMessageId: string
  providerThreadId: string | null
  fromEmail: string | null
  toEmail: string | null
  subject: string | null
  messageIdHeader?: string | null
  referencesHeader?: string | null
  metadata: Record<string, unknown> | null
}

function buildReplyHeaders(account: MailAccount, ref: MailboxMessageRef, reply: { subject: string; html: string }) {
  const to = ref.fromEmail || ref.toEmail
  if (!to) {
    throw new Error(`Reply target missing for ${account.email}`)
  }

  const references = [ref.referencesHeader, ref.messageIdHeader].filter(Boolean).join(' ').trim()

  return {
    to,
    raw: [
      `From: "${account.displayName}" <${account.email}>`,
      `To: ${to}`,
      `Subject: ${reply.subject}`,
      ...(ref.messageIdHeader ? [`In-Reply-To: ${ref.messageIdHeader}`] : []),
      ...(references ? [`References: ${references}`] : []),
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      reply.html,
    ].join('\n'),
  }
}

export async function markMailboxMessageAsRead(account: MailAccount, message: MailboxMessageRef) {
  if (account.type === 'gmail') {
    if (hasGmailImapSmtpAccess(account)) {
      await markGmailImapMessageAsRead(account, message)
      return
    }

    const { client } = await getGmailClient(account.id)
    const gmail = google.gmail({ version: 'v1', auth: client })
    await gmail.users.messages.modify({
      userId: 'me',
      id: message.providerMessageId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    })
    return
  }

  if (account.type === 'zoho' && account.zohoMailboxMode === 'api') {
    await markZohoMessagesAsRead(account, [message.providerMessageId])
    return
  }

  throw new Error('Manual mark-as-read is not supported for this mailbox connection yet')
}

export async function rescueMailboxMessageToInbox(account: MailAccount, message: MailboxMessageRef) {
  if (account.type === 'gmail') {
    if (hasGmailImapSmtpAccess(account)) {
      await rescueGmailImapMessageToInbox(account, message)
      return
    }

    const { client } = await getGmailClient(account.id)
    const gmail = google.gmail({ version: 'v1', auth: client })
    await gmail.users.messages.modify({
      userId: 'me',
      id: message.providerMessageId,
      requestBody: {
        addLabelIds: ['INBOX', 'IMPORTANT'],
        removeLabelIds: ['SPAM', 'UNREAD'],
      },
    })
    return
  }

  if (account.type === 'zoho' && account.zohoMailboxMode === 'api') {
    const folderId = typeof message.metadata === 'object' && message.metadata && 'folderId' in message.metadata
      ? String((message.metadata as Record<string, unknown>).folderId || '')
      : ''
    const folders = await getZohoFolders(account)
    const inbox = folders.find((folder) => mapZohoFolderKind(folder) === 'INBOX')
    if (!inbox) throw new Error(`Inbox folder not found for ${account.email}`)
    if (folderId && folderId !== inbox.folderId) {
      await moveZohoMessages(account, [message.providerMessageId], inbox.folderId)
    }
    await markZohoMessagesAsNotSpam(account, [message.providerMessageId])
    await markZohoMessagesAsRead(account, [message.providerMessageId])
    return
  }

  throw new Error('Manual spam rescue is not supported for this mailbox connection yet')
}

export async function replyToMailboxMessage(
  account: MailAccount,
  message: MailboxMessageRef,
  reply: { subject: string; html: string }
) {
  if (account.type === 'gmail') {
    if (hasGmailImapSmtpAccess(account)) {
      await sendGmailImapReply(account, message, reply)
      return
    }

    const { client } = await getGmailClient(account.id)
    const gmail = google.gmail({ version: 'v1', auth: client })
    const built = buildReplyHeaders(account, message, reply)
    const encoded = Buffer.from(built.raw)
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
    return
  }

  if (account.type === 'zoho' && account.zohoMailboxMode === 'api') {
    const to = message.fromEmail || message.toEmail
    if (!to) {
      throw new Error(`Reply target missing for ${account.email}`)
    }
    await sendZohoReply(account, message.providerMessageId, {
      toAddress: to,
      subject: reply.subject,
      content: reply.html,
    })
    return
  }

  throw new Error('Manual reply is not supported for this mailbox connection yet')
}
