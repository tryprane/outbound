import { Worker, type Job } from 'bullmq'
import { prisma } from '~/lib/prisma'
import { getMailboxProvider } from '~/lib/mailboxProviders'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import { mailboxInteractionQueue, type MailboxInteractionJobData } from '~/queues/mailboxInteractionQueue'

function hashToPercent(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash % 100
}

function randomDelayMs(minMinutes: number, maxMinutes: number) {
  const min = Math.max(1, minMinutes)
  const max = Math.max(min, maxMinutes)
  const minutes = Math.floor(Math.random() * (max - min + 1)) + min
  return minutes * 60_000
}

function buildReplySubject(subject?: string | null) {
  const trimmed = (subject || 'Quick follow-up').trim()
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`
}

function buildReplyBody(senderName: string, recipientName: string) {
  return `<p>Hi ${recipientName},</p><p>Thanks for the note. Sending a quick reply to keep the conversation active.</p><p>Best,<br/>${senderName}</p>`
}

function getFirstName(value?: string | null) {
  const fallback = value?.split('@')[0] || 'there'
  return fallback.split(/[._\s-]+/).filter(Boolean)[0] || 'there'
}

const DEFAULT_REPLY_PERCENT = 25
const SPAM_RESCUE_REPLY_PERCENT = 55

function shouldReply(messageId: string, boostedForSpamRescue = false) {
  const threshold = boostedForSpamRescue ? SPAM_RESCUE_REPLY_PERCENT : DEFAULT_REPLY_PERCENT
  return hashToPercent(messageId) < threshold
}

async function queueNextStage(mailboxMessageId: string, stage: NonNullable<MailboxInteractionJobData['stage']>, delayMs: number) {
  await mailboxInteractionQueue.add(
    'process-mailbox-interaction' as never,
    { mailboxMessageId, stage } as never,
    {
      jobId: `mailbox-interaction-${mailboxMessageId}-${stage}`,
      delay: delayMs,
    }
  )
}

async function processMailboxInteractionJob(job: Job<MailboxInteractionJobData>) {
  const message = await prisma.mailboxMessage.findUnique({
    where: { id: job.data.mailboxMessageId },
    include: { mailAccount: true },
  })
  if (!message) return
  if (!message.isWarmup || message.direction !== 'inbound') return

  const stage = job.data.stage || 'open'
  const provider = getMailboxProvider(message.mailAccount)
  const ref = {
    providerMessageId: message.providerMessageId,
    providerThreadId: message.providerThreadId,
    fromEmail: message.fromEmail,
    toEmail: message.toEmail,
    subject: message.subject,
    messageIdHeader: message.messageIdHeader,
    referencesHeader: message.referencesHeader,
    metadata: (message.metadata as Record<string, unknown> | null) ?? null,
  }

  if (stage === 'rescue') {
    if (!message.isSpam || message.rescuedAt) return
    await provider.rescueToInbox(ref)
    await prisma.mailboxMessage.update({
      where: { id: message.id },
      data: {
        rescuedAt: new Date(),
        isSpam: false,
        folderKind: 'INBOX',
        folderName: 'Inbox',
      },
    })
    await queueNextStage(message.id, 'open', randomDelayMs(2, 10))
    return
  }

  const refreshed = await prisma.mailboxMessage.findUnique({
    where: { id: message.id },
    include: { mailAccount: true },
  })
  if (!refreshed) return

  if (stage === 'open') {
    if (refreshed.isSpam && !refreshed.rescuedAt) {
      await queueNextStage(refreshed.id, 'rescue', randomDelayMs(5, 20))
      return
    }

    if (!refreshed.isRead || !refreshed.openedAt) {
      await provider.markAsRead(ref)
      await prisma.mailboxMessage.update({
        where: { id: refreshed.id },
        data: {
          isRead: true,
          openedAt: refreshed.openedAt ?? new Date(),
        },
      })
    }

    const boostedForSpamRescue = refreshed.isSpam || Boolean(refreshed.rescuedAt)
    if (!refreshed.repliedAt && shouldReply(refreshed.providerMessageId, boostedForSpamRescue)) {
      await queueNextStage(refreshed.id, 'reply', randomDelayMs(20, 180))
    }
    return
  }

  if (stage !== 'reply' || refreshed.repliedAt) return

  const counterpart = refreshed.fromEmail || refreshed.toEmail
  if (!counterpart) return

  const warmupCounterpart = await prisma.warmupRecipient.findUnique({ where: { email: counterpart } })
  const siblingMailbox = await prisma.mailAccount.findUnique({ where: { email: counterpart }, select: { id: true } })
  if (!(warmupCounterpart || siblingMailbox)) return

  const replySubject = buildReplySubject(refreshed.subject)
  const replyBody = buildReplyBody(
    refreshed.mailAccount.displayName,
    getFirstName(counterpart)
  )

  await provider.sendReply(ref, { subject: replySubject, html: replyBody })
  await prisma.mailboxMessage.update({
    where: { id: refreshed.id },
    data: { repliedAt: new Date() },
  })
}

export function startMailboxInteractionWorker() {
  const worker = new Worker<MailboxInteractionJobData>('mailbox-interaction-queue', processMailboxInteractionJob, {
    connection: getRedisConnection(),
    concurrency: getWorkerConcurrency('mailboxInteraction'),
  })

  worker.on('completed', (job) => {
    console.log(`[MailboxInteraction] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err: Error) => {
    console.error(`[MailboxInteraction] Job ${job?.id} failed: ${err.message}`)
  })

  console.log('[Worker] Mailbox interaction worker started')
  return worker
}
