export type MailboxFolderKind = 'INBOX' | 'SPAM' | 'SENT' | 'ARCHIVE' | 'OTHER'

export interface MailboxFolder {
  id: string
  name: string
  kind: MailboxFolderKind
}

export interface MailboxMessageRecord {
  providerMessageId: string
  providerThreadId?: string | null
  folderName?: string | null
  folderKind: MailboxFolderKind
  direction: 'inbound' | 'outbound'
  fromEmail?: string | null
  toEmail?: string | null
  subject?: string | null
  snippet?: string | null
  sentAt?: Date | null
  receivedAt?: Date | null
  messageIdHeader?: string | null
  inReplyToHeader?: string | null
  referencesHeader?: string | null
  isRead: boolean
  isStarred: boolean
  isSpam: boolean
  metadata?: Record<string, unknown> | null
}

export interface MailboxStoredMessageRef {
  providerMessageId: string
  providerThreadId?: string | null
  fromEmail?: string | null
  toEmail?: string | null
  subject?: string | null
  messageIdHeader?: string | null
  referencesHeader?: string | null
  metadata?: Record<string, unknown> | null
}

export interface MailboxProvider {
  providerName: 'gmail' | 'zoho'
  listFolders(): Promise<MailboxFolder[]>
  listRecentMessages(options?: { days?: number; limitPerFolder?: number }): Promise<MailboxMessageRecord[]>
  markAsRead(message: MailboxStoredMessageRef): Promise<void>
  rescueToInbox(message: MailboxStoredMessageRef): Promise<void>
  sendReply(message: MailboxStoredMessageRef, reply: { subject: string; html: string }): Promise<void>
}
