import { prisma } from '@/lib/prisma'
import { collectTrackedReplyMessageIds } from '@/lib/sentMailReplyTracking'

const MAILBOX_RETENTION_DAYS = Math.max(3, Number(process.env.MAILBOX_SYNC_RETENTION_DAYS ?? 30))
const WHATSAPP_RETENTION_DAYS = Math.max(3, Number(process.env.WHATSAPP_INBOX_RETENTION_DAYS ?? 45))

export async function clearUnifiedInboxData(scope: 'all' | 'email' | 'whatsapp' = 'all') {
  const results = {
    emailMessages: 0,
    emailThreads: 0,
    preservedReplyMessages: 0,
    whatsappMessages: 0,
    whatsappConversations: 0,
  }

  if (scope === 'all' || scope === 'email') {
    const sentRecords = await prisma.sentMail.findMany({
      where: { status: 'sent' },
      select: {
        id: true,
        mailAccountId: true,
        toEmail: true,
        subject: true,
        sentAt: true,
      },
    })
    const trackedReplyIds = await collectTrackedReplyMessageIds(sentRecords)

    const [preservedMessages, deletedMessages] = await prisma.$transaction([
      prisma.mailboxMessage.updateMany({
        where: { id: { in: trackedReplyIds } },
        data: {
          folderKind: 'ARCHIVE',
          folderName: 'Cleared inbox archive',
        },
      }),
      prisma.mailboxMessage.deleteMany({
        where: trackedReplyIds.length > 0 ? { id: { notIn: trackedReplyIds } } : {},
      }),
    ])
    const deletedThreads = await prisma.mailboxThread.deleteMany({
      where: {
        messages: {
          none: {},
        },
      },
    })
    results.emailMessages = deletedMessages.count
    results.emailThreads = deletedThreads.count
    results.preservedReplyMessages = preservedMessages.count
  }

  if (scope === 'all' || scope === 'whatsapp') {
    const [deletedMessages, deletedConversations] = await prisma.$transaction([
      prisma.whatsAppConversationMessage.deleteMany({}),
      prisma.whatsAppConversation.deleteMany({}),
    ])
    results.whatsappMessages = deletedMessages.count
    results.whatsappConversations = deletedConversations.count
  }

  return results
}

export async function getUnifiedInboxRetention() {
  return {
    emailDays: MAILBOX_RETENTION_DAYS,
    whatsappDays: WHATSAPP_RETENTION_DAYS,
  }
}
