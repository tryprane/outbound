import { Worker, type Job } from 'bullmq'
import { prisma } from '~/lib/prisma'
import { getMailboxProvider } from '~/lib/mailboxProviders'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import { mailboxInteractionQueue, type MailboxInteractionJobData } from '~/queues/mailboxInteractionQueue'
import { generateWarmupMailWithGemini } from '~/lib/geminiWarmup'

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
  const variants = [
    `Thanks for the note. Sending a quick reply from my side.`,
    `Good to hear from you. Keeping this reply short and natural.`,
    `Appreciate the message. Just sending a quick acknowledgment.`,
    `Saw your message and wanted to reply while I had a moment.`,
    `Thanks for checking in. Sending a short response here.`,
    `Got your message — replying quickly so the thread stays warm.`,
    `Appreciate you reaching out. Sending a brief reply from my end.`,
    `Thanks for the kind note. Just a quick word back from me.`,
    `Glad I caught this. Replying while I have a moment here.`,
    `Noted your message — wanted to acknowledge it promptly.`,
    `Thanks for keeping in touch. A short reply from my side.`,
    `Good timing on this. Just sending a warm reply back.`,
    `Appreciate it — replying briefly while the thought is fresh.`,
    `Received your message and wanted to send a quick note back.`,
    `Thanks for the hello. Keeping my reply equally short.`,
    `Good to stay in touch. Short reply from my desk.`,
    `Saw this come through and wanted to reply before the day moved on.`,
    `A brief acknowledgment from my end — thanks for the note.`,
    `Replying quickly to keep the conversation alive.`,
    `Thanks for the friendly message. Sending a short one back.`,
    `Just a quick word back — appreciate you writing.`,
    `Wanted to reply while I had the time. Thanks for the note.`,
    `Short reply from me — just keeping things warm between us.`,
    `Got it. Sending this quick note back so the thread doesn't go quiet.`,
    `Appreciate the check-in. A small reply from my side.`,
    `Always nice to have a note from you. Replying in kind.`,
    `Thanks — a brief response from me while things are calm here.`,
    `Received and replied. Hope your day continues well.`,
    `A warm reply from me — glad to stay connected.`,
    `Thanks for the message. Keeping this one short and sweet.`,
  ]
  const variant = variants[Math.abs(senderName.length + recipientName.length) % variants.length]
  return `<p>Hi ${recipientName},</p><p>${variant}</p><p>Best,<br/>${senderName}</p>`
}


function getFirstName(value?: string | null) {
  const fallback = value?.split('@')[0] || 'there'
  return fallback.split(/[._\s-]+/).filter(Boolean)[0] || 'there'
}

const DEFAULT_REPLY_PERCENT = 70
const SPAM_RESCUE_REPLY_PERCENT = 90
const WARMUP_REPLY_LLM_PROBABILITY = Math.min(
  1,
  Math.max(0, Number(process.env.WARMUP_REPLY_LLM_PROBABILITY ?? 0.85))
)

function shouldReply(messageId: string, boostedForSpamRescue = false) {
  const threshold = boostedForSpamRescue ? SPAM_RESCUE_REPLY_PERCENT : DEFAULT_REPLY_PERCENT
  return hashToPercent(messageId) < threshold
}

function canRunWarmupInteraction(account: {
  warmupStatus: string
  warmupAutoEnabled: boolean
  warmupSentToday: number
  warmupDailyLimit: number
  recommendedDailyLimit: number
}) {
  if (!account.warmupAutoEnabled) return false
  if (!['WARMING', 'WARMED'].includes(account.warmupStatus)) return false
  const effectiveLimit = Math.min(account.recommendedDailyLimit, account.warmupDailyLimit)
  return account.warmupSentToday < effectiveLimit
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
  if (!canRunWarmupInteraction(message.mailAccount)) return

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
  if (!canRunWarmupInteraction(refreshed.mailAccount)) return

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
      await queueNextStage(refreshed.id, 'reply', randomDelayMs(8, 60))
    }
    return
  }

  if (stage !== 'reply' || refreshed.repliedAt) return

  const counterpart = (refreshed.fromEmail || refreshed.toEmail)?.trim().toLowerCase()
  if (!counterpart) return

  const warmupCounterpart = await prisma.warmupRecipient.findUnique({ where: { email: counterpart } })
  const siblingMailbox = await prisma.mailAccount.findUnique({ where: { email: counterpart }, select: { id: true } })
  if (!(warmupCounterpart || siblingMailbox)) return

  // Try Gemini first for a contextual, threaded reply; fall back to template
  const geminiMail = Math.random() < WARMUP_REPLY_LLM_PROBABILITY
    ? await generateWarmupMailWithGemini({
        senderName: refreshed.mailAccount.displayName,
        recipientName: getFirstName(counterpart),
        stage: 0,
        direction: 'reply',
        originalSubject: refreshed.subject ?? undefined,
      })
    : null

  const replySubject = geminiMail?.subject ?? buildReplySubject(refreshed.subject)
  const replyBody = geminiMail?.body ?? buildReplyBody(
    refreshed.mailAccount.displayName,
    getFirstName(counterpart)
  )

  await provider.sendReply(ref, { subject: replySubject, html: replyBody })

  // Warmup accounting — mirrors the outbound warmup path so pacing
  // (sentToday), cooldown (lastMailSentAt), and stage progression
  // (WarmupMailLog) all correctly reflect this reply activity.
  await prisma.$transaction([
    prisma.mailboxMessage.update({
      where: { id: refreshed.id },
      data: { repliedAt: new Date() },
    }),
    prisma.mailAccount.update({
      where: { id: refreshed.mailAccount.id },
      data: {
        warmupSentToday: { increment: 1 },
        lastMailSentAt: new Date(),
      },
    }),
    prisma.warmupMailLog.create({
      data: {
        senderMailAccountId: refreshed.mailAccount.id,
        recipientEmail: counterpart,
        recipientType: siblingMailbox ? 'system' : 'external',
        recipientMailAccountId: siblingMailbox?.id ?? undefined,
        direction: 'reply',
        subject: replySubject,
        body: replyBody,
        status: 'sent',
        stage: refreshed.mailAccount.warmupStage,
      },
    }),
  ])
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
