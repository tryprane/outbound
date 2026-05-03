import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { MailAccount } from '@prisma/client'
import { decrypt } from '@/lib/encryption'

type MailboxMessageRef = {
  providerMessageId: string
  fromEmail?: string | null
  toEmail?: string | null
  subject?: string | null
  messageIdHeader?: string | null
  referencesHeader?: string | null
  metadata?: Record<string, unknown> | null
}

type GmailImapContent = {
  html: string | null
  text: string | null
}

type ImapFolderInfo = {
  path: string
  specialUse: string | null
}

function normalizeFolderPath(path: string) {
  return path.trim()
}

function folderKind(path: string, specialUse?: string | null) {
  const normalized = `${specialUse || ''} ${path}`.toLowerCase()
  if (normalized.includes('\\junk') || normalized.includes('spam') || normalized.includes('junk')) return 'SPAM'
  if (normalized.includes('\\sent') || normalized.includes('sent')) return 'SENT'
  if (normalized.includes('\\inbox') || normalized === 'inbox') return 'INBOX'
  return 'OTHER'
}

function getDecodedPassword(account: Pick<MailAccount, 'smtpPassword'>) {
  if (!account.smtpPassword) {
    throw new Error('Gmail app password is missing for this mailbox')
  }
  return decrypt(account.smtpPassword)
}

function parseUid(metadata: Record<string, unknown> | null | undefined) {
  const rawUid = metadata && typeof metadata.uid === 'number'
    ? metadata.uid
    : metadata && typeof metadata.uid === 'string'
      ? Number(metadata.uid)
      : NaN

  if (!Number.isFinite(rawUid) || rawUid <= 0) {
    throw new Error('IMAP message UID is missing for this synced email')
  }

  return rawUid
}

function parseFolderPath(metadata: Record<string, unknown> | null | undefined) {
  const folderPath = metadata && typeof metadata.folderPath === 'string' ? normalizeFolderPath(metadata.folderPath) : ''
  if (!folderPath) {
    throw new Error('IMAP folder path is missing for this synced email')
  }
  return folderPath
}

async function withImapClient<T>(
  account: Pick<MailAccount, 'email' | 'imapHost' | 'imapPort' | 'imapSecure' | 'smtpPassword'>,
  action: (client: ImapFlow) => Promise<T>
) {
  if (!account.imapHost || !account.imapPort || !account.smtpPassword) {
    throw new Error('Gmail IMAP settings are incomplete')
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: {
      user: account.email,
      pass: getDecodedPassword(account),
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
    specialUse: typeof entry.specialUse === 'string' ? entry.specialUse : null,
  }))
}

async function findInboxFolder(client: ImapFlow) {
  const folders = await listFolders(client)
  return folders.find((entry) => folderKind(entry.path, entry.specialUse) === 'INBOX') || { path: 'INBOX', specialUse: '\\Inbox' }
}

function buildReplyHeaders(account: Pick<MailAccount, 'displayName' | 'email'>, ref: MailboxMessageRef, reply: { subject: string; html: string }) {
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

export function hasGmailImapSmtpAccess(
  account: Pick<MailAccount, 'type' | 'smtpHost' | 'smtpPort' | 'smtpPassword' | 'imapHost' | 'imapPort'>
) {
  return (
    account.type === 'gmail' &&
    Boolean(account.smtpHost && account.smtpPort && account.smtpPassword && account.imapHost && account.imapPort)
  )
}

export async function testGmailImapSmtpConnection(options: {
  email: string
  password: string
  smtpHost: string
  smtpPort: number
  imapHost: string
  imapPort: number
  imapSecure?: boolean
}) {
  try {
    const transporter = nodemailer.createTransport({
      host: options.smtpHost,
      port: options.smtpPort,
      secure: options.smtpPort === 465,
      auth: { user: options.email, pass: options.password },
    })
    await transporter.verify()

    const client = new ImapFlow({
      host: options.imapHost,
      port: options.imapPort,
      secure: options.imapSecure ?? true,
      auth: { user: options.email, pass: options.password },
      logger: false,
    })
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    lock.release()
    await client.logout()

    return { success: true as const }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Gmail IMAP/SMTP connection failed',
    }
  }
}

export async function markGmailImapMessageAsRead(
  account: Pick<MailAccount, 'email' | 'imapHost' | 'imapPort' | 'imapSecure' | 'smtpPassword'>,
  message: MailboxMessageRef
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
  message: MailboxMessageRef
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
  message: MailboxMessageRef,
  reply: { subject: string; html: string }
) {
  if (!account.smtpHost || !account.smtpPort || !account.smtpPassword) {
    throw new Error('Gmail SMTP settings are incomplete')
  }

  const built = buildReplyHeaders(account, message, reply)
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpPort === 465,
    auth: {
      user: account.email,
      pass: getDecodedPassword(account),
    },
  })

  await transporter.sendMail({
    from: `"${account.displayName}" <${account.email}>`,
    to: built.to,
    subject: reply.subject,
    html: reply.html,
    headers: {
      ...(message.messageIdHeader ? { 'In-Reply-To': message.messageIdHeader } : {}),
      ...(message.referencesHeader
        ? { References: [message.referencesHeader, message.messageIdHeader].filter(Boolean).join(' ').trim() }
        : message.messageIdHeader
          ? { References: message.messageIdHeader }
          : {}),
    },
  })
}

export async function getGmailImapMessageContent(
  account: Pick<MailAccount, 'email' | 'imapHost' | 'imapPort' | 'imapSecure' | 'smtpPassword'>,
  message: MailboxMessageRef
): Promise<GmailImapContent> {
  const folderPath = parseFolderPath(message.metadata)
  const uid = parseUid(message.metadata)

  return withImapClient(account, async (client) => {
    const lock = await client.getMailboxLock(folderPath)
    try {
      const fetched = await client.fetchOne(uid, { uid: true, source: true }, { uid: true })
      if (!fetched || !('source' in fetched) || !fetched.source) {
        return { html: null, text: null }
      }

      const parsed = await simpleParser(fetched.source)
      const html = typeof parsed.html === 'string' ? parsed.html : null
      const text = typeof parsed.text === 'string' ? parsed.text : null
      return { html, text }
    } finally {
      lock.release()
    }
  })
}
