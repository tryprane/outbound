import type { MailAccount } from '@prisma/client'
import type {
  MailboxFolder,
  MailboxMessageRecord,
  MailboxProvider,
  MailboxStoredMessageRef,
} from '~/lib/mailboxProviders/types'
import { uniqByProviderMessageId } from '~/lib/mailboxProviders/utils'
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

/**
 * Stub kept for backward-compat — IMAP is no longer used for Zoho.
 * All mailbox access goes through the Zoho Mail API.
 */
export function isZohoImapDisabledError(_error: unknown): boolean {
  return false
}

export class ZohoMailboxProvider implements MailboxProvider {
  providerName = 'zoho' as const

  constructor(private readonly account: MailAccount) {}

  async listFolders(): Promise<MailboxFolder[]> {
    const folders = await getZohoFolders(this.account)
    return folders.map((folder) => ({
      id: folder.folderId,
      name: folder.folderName,
      kind: mapZohoFolderKind(folder),
    }))
  }

  async listRecentMessages(options: { days?: number; limitPerFolder?: number } = {}): Promise<MailboxMessageRecord[]> {
    const days = Math.max(1, options.days ?? 7)
    // Fetch more per folder so the date filter has enough to work with
    const limitPerFolder = Math.max(1, options.limitPerFolder ?? 50)
    const receivedAfter = Date.now() - days * 24 * 60 * 60 * 1000

    const folders = await getZohoFolders(this.account)
    const interesting = folders.filter((folder) => {
      const kind = mapZohoFolderKind(folder)
      return kind === 'INBOX' || kind === 'SPAM' || kind === 'SENT'
    })

    const result: MailboxMessageRecord[] = []
    for (const folder of interesting) {
      const kind = mapZohoFolderKind(folder)
      const messages = await listZohoMessages(this.account, {
        folderId: folder.folderId,
        limit: limitPerFolder,
        includesent: kind === 'SENT',
        receivedAfter,
      })
      for (const message of messages) {
        result.push(mapZohoMessageRecord(message, folder, kind))
      }
    }

    return uniqByProviderMessageId(result)
  }

  async markAsRead(message: MailboxStoredMessageRef): Promise<void> {
    await markZohoMessagesAsRead(this.account, [message.providerMessageId])
  }

  async rescueToInbox(message: MailboxStoredMessageRef): Promise<void> {
    const folderId = typeof message.metadata?.folderId === 'string' ? message.metadata.folderId : null
    const folders = await getZohoFolders(this.account)
    const inbox = folders.find((folder) => mapZohoFolderKind(folder) === 'INBOX')
    if (!inbox) throw new Error(`Inbox folder not found for ${this.account.email}`)
    if (folderId !== inbox.folderId) {
      await moveZohoMessages(this.account, [message.providerMessageId], inbox.folderId)
    }
    await markZohoMessagesAsNotSpam(this.account, [message.providerMessageId])
    await markZohoMessagesAsRead(this.account, [message.providerMessageId])
  }

  async sendReply(message: MailboxStoredMessageRef, reply: { subject: string; html: string }): Promise<void> {
    const to = message.fromEmail || message.toEmail
    if (!to) throw new Error(`Reply target missing for Zoho mailbox ${this.account.email}`)
    await sendZohoReply(this.account, message.providerMessageId, {
      toAddress: to,
      subject: reply.subject,
      content: reply.html,
    })
  }
}
