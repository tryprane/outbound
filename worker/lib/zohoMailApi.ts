import type { MailAccount } from '@prisma/client'
import { decrypt, encrypt } from '~/lib/encryption'
import { prisma } from '~/lib/prisma'

type ZohoApiEnvelope = {
  status?: {
    code?: number
    description?: string
  }
  data?: unknown
}

type ZohoAccountPayload = {
  accountId: string
  primaryEmailAddress?: string
  displayName?: string
  mailboxAddress?: string
  country?: string
}

type ZohoFolderPayload = {
  folderId: string
  folderName: string
  folderType?: string
  path?: string
}

type ZohoMessagePayload = {
  messageId: string
  threadId?: string
  subject?: string
  summary?: string
  flagid?: string
  fromAddress?: string
  toAddress?: string
  receivedTime?: string
  sentDateInGMT?: string
  status?: string
  status2?: string
  folderId?: string
  hasAttachment?: string
}

function resolveZohoAccountsBaseUrl() {
  return (process.env.ZOHO_ACCOUNTS_BASE_URL || 'https://accounts.zoho.in').replace(/\/+$/, '')
}

function resolveZohoMailApiBaseUrl(account?: Pick<MailAccount, 'zohoRegion'> | null) {
  if (account?.zohoRegion) {
    return `https://mail.zoho.${account.zohoRegion}/api`
  }
  return (process.env.ZOHO_MAIL_API_BASE_URL || 'https://mail.zoho.in/api').replace(/\/+$/, '')
}

function inferRegionFromBaseUrl(url: string) {
  const host = new URL(url).hostname
  const match = host.match(/mail\.zoho\.(.+)$/)
  return match?.[1] || 'in'
}

function normalizeMailText(value?: string | null) {
  return (value || '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractAddress(value?: string | null) {
  const normalized = normalizeMailText(value)
  const match = normalized.match(/<([^>]+)>/)
  if (match?.[1]) return match[1].trim()
  return normalized.includes('@') ? normalized.trim().replace(/^"+|"+$/g, '') : null
}

function safeDate(value?: string | number | null) {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(Number(value) || value)
  return Number.isNaN(date.getTime()) ? null : date
}

async function zohoApiRequest<T>(
  account: MailAccount,
  path: string,
  init?: RequestInit,
  retryOnAuth = true
): Promise<T> {
  const hydrated = await ensureZohoAccessToken(account)
  const baseUrl = resolveZohoMailApiBaseUrl(hydrated)
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Zoho-oauthtoken ${decrypt(hydrated.zohoAccessToken!)}`,
      ...(init?.headers || {}),
    },
  })

  if ((response.status === 401 || response.status === 403) && retryOnAuth) {
    const refreshed = await refreshZohoAccessToken(hydrated)
    return zohoApiRequest<T>(refreshed, path, init, false)
  }

  const payload = await response.json().catch(() => ({})) as ZohoApiEnvelope
  if (!response.ok || payload.status?.code && payload.status.code >= 400) {
    const description = payload.status?.description || response.statusText || 'Zoho Mail API request failed'
    throw new Error(description)
  }

  return (payload.data ?? payload) as T
}

export async function ensureZohoAccessToken(account: MailAccount) {
  if (account.type !== 'zoho') {
    throw new Error(`Zoho mailbox provider mismatch for ${account.email}`)
  }
  if (!account.zohoAccessToken || !account.zohoRefreshToken) {
    throw new Error(`Zoho API tokens missing for ${account.email}`)
  }
  if (!account.zohoTokenExpiry || account.zohoTokenExpiry > new Date(Date.now() + 60_000)) {
    return account
  }
  return refreshZohoAccessToken(account)
}

export async function refreshZohoAccessToken(account: MailAccount) {
  if (!account.zohoRefreshToken) {
    throw new Error(`Zoho refresh token missing for ${account.email}`)
  }

  const params = new URLSearchParams({
    refresh_token: decrypt(account.zohoRefreshToken),
    client_id: process.env.ZOHO_CLIENT_ID || '',
    client_secret: process.env.ZOHO_CLIENT_SECRET || '',
    grant_type: 'refresh_token',
  })

  const response = await fetch(`${resolveZohoAccountsBaseUrl()}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const payload = await response.json().catch(() => ({})) as {
    access_token?: string
    expires_in?: number
    api_domain?: string
    error?: string
    error_description?: string
  }

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Failed to refresh Zoho access token')
  }

  const apiBaseUrl = payload.api_domain ? `${payload.api_domain.replace(/\/+$/, '')}/api` : resolveZohoMailApiBaseUrl(account)
  const updated = await prisma.mailAccount.update({
    where: { id: account.id },
    data: {
      zohoAccessToken: encrypt(payload.access_token),
      zohoTokenExpiry: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : null,
      zohoRegion: inferRegionFromBaseUrl(apiBaseUrl),
      zohoLastTokenRefreshAt: new Date(),
      zohoAuthError: null,
    },
  })

  return updated
}

export async function exchangeZohoCode(code: string) {
  const redirectUri = `${process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000'}/api/mail-accounts/zoho/callback`
  const params = new URLSearchParams({
    code,
    client_id: process.env.ZOHO_CLIENT_ID || '',
    client_secret: process.env.ZOHO_CLIENT_SECRET || '',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const response = await fetch(`${resolveZohoAccountsBaseUrl()}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const payload = await response.json().catch(() => ({})) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    api_domain?: string
    error?: string
    error_description?: string
  }

  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    throw new Error(payload.error_description || payload.error || 'Failed to exchange Zoho authorization code')
  }

  const tokenRecord = {
    accessToken: encrypt(payload.access_token),
    refreshToken: encrypt(payload.refresh_token),
    expiry: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : null,
    region: inferRegionFromBaseUrl(payload.api_domain ? `${payload.api_domain}/api` : resolveZohoMailApiBaseUrl(null)),
  }

  const tempAccount = {
    id: 'temp',
    type: 'zoho',
    email: 'temp',
    displayName: 'temp',
    zohoAccessToken: tokenRecord.accessToken,
    zohoRefreshToken: tokenRecord.refreshToken,
    zohoTokenExpiry: tokenRecord.expiry,
    zohoRegion: tokenRecord.region,
  } as MailAccount

  const accounts = await zohoApiRequest<ZohoAccountPayload[]>(tempAccount, '/accounts')
  const primary = accounts.find((item) => item.primaryEmailAddress) || accounts[0]
  if (!primary?.accountId || !primary.primaryEmailAddress) {
    throw new Error('Zoho account details not found after OAuth')
  }

  return {
    accountId: primary.accountId,
    email: primary.primaryEmailAddress,
    displayName: primary.displayName || primary.mailboxAddress || primary.primaryEmailAddress,
    region: tokenRecord.region,
    accessToken: tokenRecord.accessToken,
    refreshToken: tokenRecord.refreshToken,
    tokenExpiry: tokenRecord.expiry,
  }
}

export async function getZohoFolders(account: MailAccount) {
  return zohoApiRequest<ZohoFolderPayload[]>(account, `/accounts/${account.zohoAccountId}/folders`)
}

export async function listZohoMessages(
  account: MailAccount,
  options: { folderId: string; start?: number; limit?: number; includesent?: boolean } 
) {
  const search = new URLSearchParams({
    folderId: options.folderId,
    start: String(options.start ?? 1),
    limit: String(options.limit ?? 25),
    sortBy: 'date',
    sortorder: 'false',
    includeto: 'true',
    includesent: String(Boolean(options.includesent)),
    threadedMails: 'true',
  })
  return zohoApiRequest<ZohoMessagePayload[]>(account, `/accounts/${account.zohoAccountId}/messages/view?${search.toString()}`)
}

export async function markZohoMessagesAsRead(account: MailAccount, messageIds: string[]) {
  return zohoApiRequest(account, `/accounts/${account.zohoAccountId}/updatemessage`, {
    method: 'PUT',
    body: JSON.stringify({
      mode: 'markAsRead',
      messageId: messageIds.map((id) => Number(id)),
    }),
  })
}

export async function markZohoMessagesAsNotSpam(account: MailAccount, messageIds: string[]) {
  return zohoApiRequest(account, `/accounts/${account.zohoAccountId}/updatemessage`, {
    method: 'PUT',
    body: JSON.stringify({
      mode: 'markNotSpam',
      messageId: messageIds.map((id) => Number(id)),
    }),
  })
}

export async function moveZohoMessages(account: MailAccount, messageIds: string[], destinationFolderId: string) {
  return zohoApiRequest(account, `/accounts/${account.zohoAccountId}/updatemessage`, {
    method: 'PUT',
    body: JSON.stringify({
      mode: 'moveMessage',
      messageId: messageIds.map((id) => Number(id)),
      destfolderId: destinationFolderId,
    }),
  })
}

export async function sendZohoReply(
  account: MailAccount,
  messageId: string,
  reply: { toAddress: string; subject: string; content: string }
) {
  return zohoApiRequest(account, `/accounts/${account.zohoAccountId}/messages/${messageId}`, {
    method: 'POST',
    body: JSON.stringify({
      fromAddress: account.email,
      toAddress: reply.toAddress,
      subject: reply.subject,
      content: reply.content,
      mailFormat: 'html',
      askReceipt: 'no',
      action: 'reply',
    }),
  })
}

export function mapZohoFolderKind(folder: ZohoFolderPayload) {
  const value = `${folder.folderType || ''} ${folder.folderName || ''} ${folder.path || ''}`.toLowerCase()
  if (value.includes('spam')) return 'SPAM'
  if (value.includes('sent')) return 'SENT'
  if (value.includes('archive')) return 'ARCHIVE'
  if (value.includes('inbox')) return 'INBOX'
  return 'OTHER'
}

export function mapZohoMessageRecord(
  message: ZohoMessagePayload,
  folder: ZohoFolderPayload,
  folderKind: 'INBOX' | 'SPAM' | 'SENT' | 'ARCHIVE' | 'OTHER'
) {
  return {
    providerMessageId: message.messageId,
    providerThreadId: message.threadId || null,
    folderName: folder.folderName,
    folderKind,
    direction: folderKind === 'SENT' ? 'outbound' as const : 'inbound' as const,
    fromEmail: extractAddress(message.fromAddress),
    toEmail: extractAddress(message.toAddress),
    subject: normalizeMailText(message.subject) || null,
    snippet: normalizeMailText(message.summary) || null,
    sentAt: safeDate(message.sentDateInGMT),
    receivedAt: safeDate(message.receivedTime),
    messageIdHeader: null,
    inReplyToHeader: null,
    referencesHeader: null,
    isRead: message.status === '1',
    isStarred: message.flagid ? message.flagid !== 'flag_not_set' : false,
    isSpam: folderKind === 'SPAM',
    metadata: {
      folderId: folder.folderId,
      folderName: folder.folderName,
      threadId: message.threadId || null,
      status: message.status,
      status2: message.status2,
      hasAttachment: message.hasAttachment,
    } as Record<string, unknown>,
  }
}

export function isZohoApiAuthError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error).toLowerCase()
  return (
    message.includes('invalid oauth') ||
    message.includes('invalid oauth token') ||
    message.includes('invalid_code') ||
    message.includes('invalid_client') ||
    message.includes('access denied') ||
    message.includes('expired') ||
    message.includes('unauthorized')
  )
}
