import { google } from 'googleapis'
import type { MailAccount } from '@prisma/client'
import { getGmailClient } from '@/lib/mailer/gmail'
import { getGmailImapMessageContent, hasGmailImapSmtpAccess } from '@/lib/gmailImapMailbox'
import { getZohoMessageContent } from '@/lib/zohoMailApi'

type MailboxMessageRef = {
  providerMessageId: string
  metadata: Record<string, unknown> | null
}

export type MailboxMessageContent = {
  html: string | null
  text: string | null
}

function decodeBase64Url(value?: string | null) {
  if (!value) return ''
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
}

function collectGmailParts(
  part: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: any[] | null } | null | undefined,
  htmlParts: string[],
  textParts: string[]
) {
  if (!part) return
  const mimeType = (part.mimeType || '').toLowerCase()
  const bodyData = decodeBase64Url(part.body?.data)

  if (bodyData) {
    if (mimeType === 'text/html') {
      htmlParts.push(bodyData)
    } else if (mimeType === 'text/plain') {
      textParts.push(bodyData)
    }
  }

  for (const child of part.parts || []) {
    collectGmailParts(child, htmlParts, textParts)
  }
}

function convertTextToHtml(value: string) {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<pre style="white-space: pre-wrap; font: 14px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; margin: 0;">${escaped}</pre>`
}

async function loadGmailMessageContent(account: MailAccount, messageId: string): Promise<MailboxMessageContent> {
  const { client } = await getGmailClient(account.id)
  const gmail = google.gmail({ version: 'v1', auth: client })
  const detail = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })

  const htmlParts: string[] = []
  const textParts: string[] = []
  collectGmailParts(detail.data.payload, htmlParts, textParts)

  const html = htmlParts.join('\n').trim() || null
  const text = textParts.join('\n').trim() || null

  return {
    html: html || (text ? convertTextToHtml(text) : null),
    text,
  }
}

async function loadZohoMessageContent(account: MailAccount, message: MailboxMessageRef): Promise<MailboxMessageContent> {
  const folderId =
    typeof message.metadata === 'object' && message.metadata && 'folderId' in message.metadata
      ? String(message.metadata.folderId || '')
      : ''

  if (!folderId) {
    throw new Error('Zoho folder id missing for this synced message')
  }

  const detail = await getZohoMessageContent(account, message.providerMessageId, folderId)
  const html = typeof detail?.content === 'string' ? detail.content.trim() : ''

  return {
    html: html || null,
    text: html ? null : null,
  }
}

export async function loadMailboxMessageContent(account: MailAccount, message: MailboxMessageRef): Promise<MailboxMessageContent> {
  if (account.type === 'gmail') {
    if (hasGmailImapSmtpAccess(account)) {
      return getGmailImapMessageContent(account, message)
    }
    return loadGmailMessageContent(account, message.providerMessageId)
  }

  if (account.type === 'zoho' && account.zohoMailboxMode === 'api') {
    return loadZohoMessageContent(account, message)
  }

  throw new Error('Full message view is not supported for this mailbox connection yet')
}
