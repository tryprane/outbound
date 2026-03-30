import type { MailAccount } from '@prisma/client'
import type { MailboxProvider } from '~/lib/mailboxProviders/types'
import { GmailMailboxProvider } from '~/lib/mailboxProviders/gmailMailboxProvider'
import { ZohoMailboxProvider } from '~/lib/mailboxProviders/zohoMailboxProvider'

export function getMailboxProvider(account: MailAccount): MailboxProvider {
  if (account.type === 'gmail') {
    return new GmailMailboxProvider(account)
  }
  if (account.type === 'zoho') {
    return new ZohoMailboxProvider(account)
  }
  throw new Error(`Unsupported mailbox provider for account ${account.email}`)
}
