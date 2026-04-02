import { Worker, type Job } from 'bullmq'
import { Prisma } from '@prisma/client'
import { prisma } from '~/lib/prisma'
import { getMailboxProvider } from '~/lib/mailboxProviders'
import { isGmailMailboxPermissionError } from '~/lib/mailboxProviders/gmailMailboxProvider'
import { isZohoImapDisabledError } from '~/lib/mailboxProviders/zohoMailboxProvider'
import { isZohoApiAuthError } from '~/lib/zohoMailApi'
import type { MailboxMessageRecord } from '~/lib/mailboxProviders/types'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import { mailboxInteractionQueue } from '~/queues/mailboxInteractionQueue'
import type { MailboxSyncJobData } from '~/queues/mailboxSyncQueue'

const ZOHO_IMAP_DISABLED_MESSAGE = 'Zoho IMAP is turned off for this mailbox'

async function resolveThread(mailAccountId: string, message: MailboxMessageRecord) {
  const providerThreadId = message.providerThreadId || message.messageIdHeader || message.providerMessageId
  return prisma.mailboxThread.upsert({
    where: {
      mailAccountId_providerThreadId: {
        mailAccountId,
        providerThreadId,
      },
    },
    create: {
      mailAccountId,
      providerThreadId,
      subject: message.subject || undefined,
      lastMessageAt: message.receivedAt || message.sentAt || new Date(),
    },
    update: {
      subject: message.subject || undefined,
      lastMessageAt: message.receivedAt || message.sentAt || new Date(),
    },
  })
}

async function detectWarmup(mailAccountId: string, message: MailboxMessageRecord): Promise<boolean> {
  const counterpart = message.direction === 'outbound' ? message.toEmail : message.fromEmail
  if (!counterpart) return false

  const [recipient, siblingMailbox] = await Promise.all([
    prisma.warmupRecipient.findUnique({ where: { email: counterpart } }),
    prisma.mailAccount.findUnique({ where: { email: counterpart }, select: { id: true } }),
  ])

  if (recipient) return true
  if (siblingMailbox && siblingMailbox.id !== mailAccountId) return true
  return false
}

function calculateHealth(messages: Array<{
  direction: string
  folderKind: string
  isRead: boolean
  openedAt: Date | null
  repliedAt: Date | null
  rescuedAt: Date | null
  isWarmup: boolean
}>){
  const relevant = messages.filter((message) => message.isWarmup)
  const inbound = relevant.filter((message) => message.direction === 'inbound')
  const outbound = relevant.filter((message) => message.direction === 'outbound')
  const inboxInbound = inbound.filter((message) => message.folderKind === 'INBOX')
  const spamInbound = inbound.filter((message) => message.folderKind === 'SPAM')
  const readInbound = inbound.filter((message) => message.isRead || Boolean(message.openedAt))
  const repliedInbound = inbound.filter((message) => message.repliedAt)
  const rescued = inbound.filter((message) => message.rescuedAt)

  const inboxRate = inbound.length > 0 ? inboxInbound.length / inbound.length : 0
  const spamRate = inbound.length > 0 ? spamInbound.length / inbound.length : 0
  const readRate = inbound.length > 0 ? readInbound.length / inbound.length : 0
  const replyRate = inbound.length > 0 ? repliedInbound.length / inbound.length : 0
  const rescueRate = spamInbound.length > 0 ? rescued.length / spamInbound.length : 0

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(inboxRate * 40 + readRate * 20 + replyRate * 20 + rescueRate * 10 + (1 - spamRate) * 10)
    )
  )

  let healthStatus = 'cold'
  if (score >= 80) healthStatus = 'healthy'
  else if (score >= 55) healthStatus = 'warming'
  else if (score > 0) healthStatus = 'at_risk'

  return {
    healthScore: score,
    healthStatus,
    inboxRate,
    spamRate,
    readRate,
    replyRate,
    rescueRate,
    sentCount: outbound.length,
    receivedCount: inbound.length,
    rescuedCount: rescued.length,
  }
}

function deriveWarmupAutomation(account: {
  warmupStatus: string
  warmupAutoEnabled: boolean
  recommendedDailyLimit: number
  mailboxSyncError: string | null
}, health: ReturnType<typeof calculateHealth>) {
  const totalActivity = health.sentCount + health.receivedCount
  const decisions: Record<string, unknown> = {}
  let note = 'Mailbox sync completed'

  if (totalActivity >= 6 && health.healthScore < 35 && account.warmupAutoEnabled) {
    decisions.warmupStatus = 'PAUSED'
    decisions.warmupPausedAt = new Date()
    decisions.isActive = false
    decisions.recommendedDailyLimit = Math.max(5, Math.floor(account.recommendedDailyLimit * 0.5))
    note = `Auto-paused warmup because mailbox health dropped to ${health.healthScore}`
  } else if (
    totalActivity >= 6 &&
    account.warmupStatus === 'PAUSED' &&
    account.warmupAutoEnabled &&
    !account.mailboxSyncError &&
    health.healthScore >= 72
  ) {
    decisions.warmupStatus = 'WARMING'
    decisions.warmupPausedAt = null
    decisions.recommendedDailyLimit = Math.max(account.recommendedDailyLimit, 10)
    note = `Auto-resumed warmup because mailbox health recovered to ${health.healthScore}`
  } else if (totalActivity >= 6 && health.healthScore < 55 && account.warmupStatus === 'WARMING') {
    decisions.recommendedDailyLimit = Math.max(5, Math.floor(account.recommendedDailyLimit * 0.8))
    note = `Reduced warmup pace because mailbox health is ${health.healthScore}`
  }

  return {
    decisions,
    note,
  }
}

export function shouldSkipMailboxSync(account: { type: string; mailboxSyncError: string | null }) {
  return (
    (account.type === 'gmail' && account.mailboxSyncError === 'Reconnect Gmail account to grant mailbox sync permissions') ||
    (account.type === 'zoho' && (
      account.mailboxSyncError === 'Enable IMAP for this Zoho mailbox, then retry mailbox sync' ||
      account.mailboxSyncError === ZOHO_IMAP_DISABLED_MESSAGE ||
      account.mailboxSyncError === 'Reconnect Zoho account to restore mailbox API access'
    ))
  )
}

async function processMailboxSyncJob(job: Job<MailboxSyncJobData>) {
  const account = await prisma.mailAccount.findUnique({ where: { id: job.data.mailAccountId } })
  if (!account) return

  if (shouldSkipMailboxSync(account)) {
    return
  }

  await prisma.mailAccount.update({
    where: { id: account.id },
    data: { mailboxSyncStatus: 'syncing', mailboxSyncError: null },
  })

  try {
    const provider = getMailboxProvider(account)
    const messages = await provider.listRecentMessages({ days: 7, limitPerFolder: 25 })

    for (const message of messages) {
      const thread = await resolveThread(account.id, message)
      const isWarmup = await detectWarmup(account.id, message)
      await prisma.mailboxMessage.upsert({
        where: {
          mailAccountId_providerMessageId: {
            mailAccountId: account.id,
            providerMessageId: message.providerMessageId,
          },
        },
        create: {
          mailAccountId: account.id,
          mailboxThreadId: thread.id,
          providerMessageId: message.providerMessageId,
          providerThreadId: message.providerThreadId || undefined,
          folderKind: message.folderKind,
          folderName: message.folderName || undefined,
          direction: message.direction,
          fromEmail: message.fromEmail || undefined,
          toEmail: message.toEmail || undefined,
          subject: message.subject || undefined,
          snippet: message.snippet || undefined,
          sentAt: message.sentAt || undefined,
          receivedAt: message.receivedAt || undefined,
          messageIdHeader: message.messageIdHeader || undefined,
          inReplyToHeader: message.inReplyToHeader || undefined,
          referencesHeader: message.referencesHeader || undefined,
          isWarmup,
          isRead: message.isRead,
          isStarred: message.isStarred,
          isSpam: message.isSpam,
          metadata: (message.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        },
        update: {
          mailboxThreadId: thread.id,
          providerThreadId: message.providerThreadId || undefined,
          folderKind: message.folderKind,
          folderName: message.folderName || undefined,
          direction: message.direction,
          fromEmail: message.fromEmail || undefined,
          toEmail: message.toEmail || undefined,
          subject: message.subject || undefined,
          snippet: message.snippet || undefined,
          sentAt: message.sentAt || undefined,
          receivedAt: message.receivedAt || undefined,
          messageIdHeader: message.messageIdHeader || undefined,
          inReplyToHeader: message.inReplyToHeader || undefined,
          referencesHeader: message.referencesHeader || undefined,
          isWarmup,
          isRead: message.isRead,
          isStarred: message.isStarred,
          isSpam: message.isSpam,
          metadata: (message.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        },
      })
    }

    const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const storedMessages = await prisma.mailboxMessage.findMany({
      where: {
        mailAccountId: account.id,
        OR: [
          { receivedAt: { gte: periodStart } },
          { sentAt: { gte: periodStart } },
        ],
      },
      select: {
        direction: true,
        folderKind: true,
        isRead: true,
        openedAt: true,
        repliedAt: true,
        rescuedAt: true,
        isWarmup: true,
      },
    })

    const health = calculateHealth(storedMessages)
    const automation = deriveWarmupAutomation(account, health)

    await prisma.$transaction([
      prisma.mailAccount.update({
        where: { id: account.id },
        data: {
          mailboxLastSyncedAt: new Date(),
          mailboxSyncStatus: 'idle',
          mailboxSyncError: null,
          mailboxHealthScore: health.healthScore,
          mailboxHealthStatus: health.healthStatus,
          ...automation.decisions,
        },
      }),
      prisma.warmupHealthSnapshot.create({
        data: {
          mailAccountId: account.id,
          periodStart,
          periodEnd: new Date(),
          healthScore: health.healthScore,
          healthStatus: health.healthStatus,
          inboxRate: health.inboxRate,
          spamRate: health.spamRate,
          readRate: health.readRate,
          replyRate: health.replyRate,
          rescueRate: health.rescueRate,
          sentCount: health.sentCount,
          receivedCount: health.receivedCount,
          rescuedCount: health.rescuedCount,
          notes: `${automation.note}. Sync source: ${job.data.reason || 'scheduled'}; imported ${messages.length} messages`,
        },
      }),
    ])

    const pendingInteractions = await prisma.mailboxMessage.findMany({
      where: {
        mailAccountId: account.id,
        isWarmup: true,
        direction: 'inbound',
        OR: [
          { isSpam: true, rescuedAt: null },
          { isRead: false },
          { openedAt: null },
          { repliedAt: null },
        ],
      },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
      take: 15,
      select: { id: true },
    })

    for (const candidate of pendingInteractions) {
      await mailboxInteractionQueue.add(
        'process-mailbox-interaction' as never,
        { mailboxMessageId: candidate.id, stage: 'open' } as never,
        {
          jobId: `mailbox-interaction-${candidate.id}-open`,
          delay: (Math.floor(Math.random() * 14) + 2) * 60_000,
        }
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const nextMessage =
      account.type === 'gmail' && isGmailMailboxPermissionError(error)
        ? 'Reconnect Gmail account to grant mailbox sync permissions'
        : account.type === 'zoho' && isZohoImapDisabledError(error)
          ? 'Enable IMAP for this Zoho mailbox, then retry mailbox sync'
          : account.type === 'zoho' && isZohoApiAuthError(error)
            ? 'Reconnect Zoho account to restore mailbox API access'
          : message
    const shouldDowngradeToIdle =
      (account.type === 'gmail' && isGmailMailboxPermissionError(error)) ||
      (account.type === 'zoho' && (isZohoImapDisabledError(error) || isZohoApiAuthError(error)))
    await prisma.mailAccount.update({
      where: { id: account.id },
      data: {
        mailboxSyncStatus: shouldDowngradeToIdle ? 'idle' : 'error',
        mailboxSyncError: nextMessage,
      },
    })
    throw error
  }
}

export function startMailboxSyncWorker() {
  const worker = new Worker<MailboxSyncJobData>('mailbox-sync-queue', processMailboxSyncJob, {
    connection: getRedisConnection(),
    concurrency: getWorkerConcurrency('mailboxSync'),
  })

  worker.on('completed', (job) => {
    console.log(`[MailboxSync] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err: Error) => {
    console.error(`[MailboxSync] Job ${job?.id} failed: ${err.message}`)
  })

  console.log('[Worker] Mailbox sync worker started')
  return worker
}
