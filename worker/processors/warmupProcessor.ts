import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import { prisma } from '~/lib/prisma'
import { WarmupJobData } from '~/queues/warmupQueue'
import { mailboxSyncQueue } from '~/queues/mailboxSyncQueue'
import { sendViaGmail, sendViaZoho } from '~/lib/mailSenders'
import { generateWarmupMailWithGemini } from '~/lib/geminiWarmup'

const REPLY_PROBABILITY = 0.35
const GEMINI_WARMUP_PROBABILITY = 0.2
const warmupDeps = {
  prisma,
  mailboxSyncQueue,
  sendViaGmail,
  sendViaZoho,
  random: () => Math.random(),
  now: () => Date.now(),
}
type WarmupMailTemplate = {
  subject: string
  body: (args: { senderName: string; recipientName: string }) => string
}

function getFirstName(displayNameOrEmail: string) {
  const candidate = displayNameOrEmail.includes('@') ? displayNameOrEmail.split('@')[0] : displayNameOrEmail
  const cleaned = candidate.trim().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ')
  if (!cleaned) return 'there'
  return cleaned.split(' ')[0]
}

function pickTemplate<T>(templates: T[], seed: number) {
  return templates[Math.abs(seed + Math.floor(Math.random() * 997)) % templates.length]
}

const OUTBOUND_TEMPLATES: WarmupMailTemplate[] = [
  {
    subject: 'Quick intro',
    body: ({ senderName, recipientName }) =>
      `<p>Hi ${recipientName},</p><p>Hope your week is going well. I wanted to send a quick note and introduce myself.</p><p>If it’s useful, I can share a bit more context on what we are working on.</p><p>Best,<br/>${senderName}</p>`,
  },
  {
    subject: 'Following up briefly',
    body: ({ senderName, recipientName }) =>
      `<p>Hi ${recipientName},</p><p>Just following up on a short note from my side. No rush at all, I wanted to keep the conversation open.</p><p>Thanks,<br/>${senderName}</p>`,
  },
  {
    subject: 'A quick question',
    body: ({ senderName, recipientName }) =>
      `<p>Hi ${recipientName},</p><p>I had one quick question and thought I’d reach out directly. Do you have a preferred contact for future conversations?</p><p>Regards,<br/>${senderName}</p>`,
  },
  {
    subject: 'Shared context',
    body: ({ senderName, recipientName }) =>
      `<p>Hello ${recipientName},</p><p>I’ve been reviewing a few related ideas and thought this might be relevant to you as well.</p><p>If you’re open to it, I can send over a short summary.</p><p>Best regards,<br/>${senderName}</p>`,
  },
  {
    subject: 'Checking in',
    body: ({ senderName, recipientName }) =>
      `<p>Hi ${recipientName},</p><p>Checking in with a brief note. I’m keeping this short, but wanted to make sure my earlier message did not get buried.</p><p>Thanks again,<br/>${senderName}</p>`,
  },
  {
    subject: 'Short note',
    body: ({ senderName, recipientName }) =>
      `<p>Hi ${recipientName},</p><p>Sharing a short note from my side. Happy to connect if you think there’s a fit.</p><p>Best,<br/>${senderName}</p>`,
  },
]

const REPLY_TEMPLATES: WarmupMailTemplate[] = [
  {
    subject: 'Re: Quick intro',
    body: ({ senderName, recipientName }) =>
      `<p>Hi ${recipientName},</p><p>Thanks for reaching out. Appreciate the note and wanted to reply briefly to keep the thread moving.</p><p>Best,<br/>${senderName}</p>`,
  },
  {
    subject: 'Re: Following up',
    body: ({ senderName, recipientName }) =>
      `<p>Hi ${recipientName},</p><p>Thanks for the follow-up. I’ve seen your message and wanted to send a quick acknowledgment.</p><p>Regards,<br/>${senderName}</p>`,
  },
  {
    subject: 'Re: A quick question',
    body: ({ senderName, recipientName }) =>
      `<p>Hello ${recipientName},</p><p>Thanks for the quick question. Sending a short reply so the conversation stays active.</p><p>Best,<br/>${senderName}</p>`,
  },
  {
    subject: 'Re: Shared context',
    body: ({ senderName, recipientName }) =>
      `<p>Hi ${recipientName},</p><p>Appreciate the context you shared. Just replying to keep the exchange natural and active.</p><p>Best regards,<br/>${senderName}</p>`,
  },
]

function buildWarmupMail(stage: number, senderName: string, recipientName: string) {
  const subjectVariants = [
    'Quick intro',
    'Following up briefly',
    'A quick question',
    'Shared context',
    'Checking in',
    'Short note',
  ]
  const subject = pickTemplate(subjectVariants, stage)
  const openingVariants = [
    `Hi ${recipientName},`,
    `Hello ${recipientName},`,
    `Hi there,`,
  ]
  const opening = pickTemplate(openingVariants, stage + senderName.length)
  const middleVariants = [
    'Hope your week is going well. I wanted to send a quick note and introduce myself.',
    'Just a short note from my side. I wanted to keep the conversation open.',
    'I had one quick question and thought I would reach out directly.',
    "I've been reviewing a few related ideas and thought this might be relevant to you as well.",
    "Checking in with a brief note. I'm keeping this short, but wanted to make sure my earlier message did not get buried.",
    'Sharing a short note from my side. Happy to connect if you think there is a fit.',
  ]
  const middle = pickTemplate(middleVariants, stage * 3)
  const closingVariants = [
    `<p>If it's useful, I can share a bit more context on what we are working on.</p><p>Best,<br/>${senderName}</p>`,
    `<p>No rush at all, I wanted to keep the conversation open.</p><p>Thanks,<br/>${senderName}</p>`,
    `<p>Do you have a preferred contact for future conversations?</p><p>Regards,<br/>${senderName}</p>`,
    `<p>If you're open to it, I can send over a short summary.</p><p>Best regards,<br/>${senderName}</p>`,
    `<p>Wanted to keep this brief, but still useful.</p><p>Thanks again,<br/>${senderName}</p>`,
    `<p>Happy to connect if you think there's a fit.</p><p>Best,<br/>${senderName}</p>`,
  ]
  const closing = pickTemplate(closingVariants, stage + recipientName.length)
  return {
    subject,
    body: `<p>${opening}</p><p>${middle}</p>${closing}`,
  }
}

async function buildOutboundWarmupMail(stage: number, senderName: string, recipientName: string) {
  const fallbackMail = buildWarmupMail(stage, senderName, recipientName)
  if (warmupDeps.random() >= GEMINI_WARMUP_PROBABILITY) {
    return fallbackMail
  }

  const geminiMail = await generateWarmupMailWithGemini({
    senderName,
    recipientName,
    stage,
    direction: 'outbound',
  })

  if (!geminiMail) {
    return fallbackMail
  }

  return geminiMail
}

function buildReplyMail(senderDisplayName: string, recipientDisplayName: string) {
  const subjectVariants = [
    'Re: Quick intro',
    'Re: Following up',
    'Re: A quick question',
    'Re: Shared context',
  ]
  const subject = pickTemplate(subjectVariants, senderDisplayName.length + recipientDisplayName.length)
  const openingVariants = [
    `Hi ${recipientDisplayName},`,
    `Hello ${recipientDisplayName},`,
  ]
  const opening = pickTemplate(openingVariants, senderDisplayName.length)
  const middleVariants = [
    'Thanks for reaching out. Appreciate the note and wanted to reply briefly to keep the thread moving.',
    'Thanks for the follow-up. I have seen your message and wanted to send a quick acknowledgment.',
    'Thanks for the quick question. Sending a short reply so the conversation stays active.',
    'Appreciate the context you shared. Just replying to keep the exchange natural and active.',
  ]
  const middle = pickTemplate(middleVariants, recipientDisplayName.length)
  return {
    subject,
    body: `<p>${opening}</p><p>${middle}</p><p>Best,<br/>${senderDisplayName}</p>`,
  }
}

function classifyWarmupFailure(error: unknown): 'failed' | 'bounced' {
  const message = String(error instanceof Error ? error.message : error).toLowerCase()
  if (
    message.includes('550') ||
    message.includes('551') ||
    message.includes('552') ||
    message.includes('553') ||
    message.includes('554') ||
    message.includes('mailbox unavailable') ||
    message.includes('user unknown')
  ) {
    return 'bounced'
  }
  return 'failed'
}

function isAuthGrantFailure(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error).toLowerCase()
  return (
    message.includes('invalid_grant') ||
    message.includes('refresh token') && message.includes('invalid') ||
    message.includes('token has been expired') ||
    message.includes('reauth')
  )
}

async function chooseWarmupRecipient(senderAccountId: string, senderEmail: string) {
  const senderDomain = senderEmail.split('@')[1]?.toLowerCase() || ''
  const customRecipients = await warmupDeps.prisma.warmupRecipient.findMany({
    where: { isActive: true, isSystem: false, email: { not: senderEmail } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })

  const systemCandidates = await warmupDeps.prisma.mailAccount.findMany({
    where: {
      id: { not: senderAccountId },
      warmupStatus: { in: ['WARMING', 'WARMED'] },
      warmupAutoEnabled: true,
      email: { not: senderEmail },
    },
    select: { id: true, email: true, displayName: true, type: true },
    take: 50,
  })

  if (systemCandidates.length > 0) {
    const crossDomainSystemCandidates = systemCandidates.filter(
      (candidate) => (candidate.email.split('@')[1]?.toLowerCase() || '') !== senderDomain
    )
    const eligibleSystemCandidates = crossDomainSystemCandidates.length > 0 ? crossDomainSystemCandidates : systemCandidates
    const counts = await warmupDeps.prisma.warmupMailLog.groupBy({
      by: ['recipientMailAccountId'],
      where: {
        senderMailAccountId: senderAccountId,
        recipientMailAccountId: { in: eligibleSystemCandidates.map((s) => s.id) },
      },
      _count: { _all: true },
    })
    const countMap = new Map<string, number>()
    for (const item of counts) {
      if (item.recipientMailAccountId) countMap.set(item.recipientMailAccountId, item._count._all)
    }

    const sorted = [...eligibleSystemCandidates].sort((a, b) => {
      const ac = countMap.get(a.id) ?? 0
      const bc = countMap.get(b.id) ?? 0
      return ac - bc
    })
    const chosen = sorted[0]
    return {
      type: 'system' as const,
      email: chosen.email,
      recipientMailAccountId: chosen.id,
      recipientDisplayName: chosen.displayName,
    }
  }

  if (customRecipients.length > 0) {
    const crossDomainCustomRecipients = customRecipients.filter(
      (recipient) => (recipient.email.split('@')[1]?.toLowerCase() || '') !== senderDomain
    )
    const eligibleCustomRecipients = crossDomainCustomRecipients.length > 0 ? crossDomainCustomRecipients : customRecipients
    const counts = await warmupDeps.prisma.warmupMailLog.groupBy({
      by: ['recipientEmail'],
      where: { senderMailAccountId: senderAccountId, recipientEmail: { in: eligibleCustomRecipients.map((c) => c.email) } },
      _count: { _all: true },
    })
    const countMap = new Map<string, number>()
    for (const item of counts) countMap.set(item.recipientEmail, item._count._all)
    const sorted = [...eligibleCustomRecipients].sort((a, b) => (countMap.get(a.email) ?? 0) - (countMap.get(b.email) ?? 0))
    const chosen = sorted[0]
    return {
      type: 'external' as const,
      email: chosen.email,
      recipientMailAccountId: null,
      recipientDisplayName: chosen.name || chosen.email,
    }
  }

  const fallbackSystemCandidates = await warmupDeps.prisma.mailAccount.findMany({
    where: {
      id: { not: senderAccountId },
      email: { not: senderEmail },
      warmupStatus: { in: ['WARMING', 'WARMED', 'PAUSED'] },
    },
    select: { id: true, email: true, displayName: true, type: true, warmupStatus: true },
    take: 100,
  })

  if (fallbackSystemCandidates.length > 0) {
    const crossDomainFallbackCandidates = fallbackSystemCandidates.filter(
      (candidate) => (candidate.email.split('@')[1]?.toLowerCase() || '') !== senderDomain
    )
    const eligibleFallbackCandidates = crossDomainFallbackCandidates.length > 0 ? crossDomainFallbackCandidates : fallbackSystemCandidates
    const counts = await warmupDeps.prisma.warmupMailLog.groupBy({
      by: ['recipientMailAccountId'],
      where: {
        senderMailAccountId: senderAccountId,
        recipientMailAccountId: { in: eligibleFallbackCandidates.map((s) => s.id) },
      },
      _count: { _all: true },
    })
    const countMap = new Map<string, number>()
    for (const item of counts) {
      if (item.recipientMailAccountId) countMap.set(item.recipientMailAccountId, item._count._all)
    }

    const sorted = [...eligibleFallbackCandidates].sort((a, b) => {
      const ac = countMap.get(a.id) ?? 0
      const bc = countMap.get(b.id) ?? 0
      return ac - bc
    })
    const chosen = sorted[0]
    console.log(
      `[Warmup] Using fallback recipient ${chosen.email} for ${senderEmail} (status=${chosen.warmupStatus})`
    )
    return {
      type: 'system' as const,
      email: chosen.email,
      recipientMailAccountId: chosen.id,
      recipientDisplayName: chosen.displayName,
    }
  }

  return null
}

async function sendFromAccount(mailAccountId: string, toEmail: string, subject: string, html: string) {
  const account = await warmupDeps.prisma.mailAccount.findUnique({ where: { id: mailAccountId } })
  if (!account) throw new Error('Sender account missing')
  if (account.type === 'zoho') return warmupDeps.sendViaZoho(mailAccountId, toEmail, subject, html)
  if (account.type === 'gmail') return warmupDeps.sendViaGmail(mailAccountId, toEmail, subject, html)
  throw new Error(`Unsupported sender type: ${account.type}`)
}

async function processWarmupJob(job: Job<WarmupJobData>) {
  const { mailAccountId } = job.data
  const sender = await warmupDeps.prisma.mailAccount.findUnique({ where: { id: mailAccountId } })
  if (!sender) return
  if (!sender.warmupAutoEnabled) {
    console.log(`[Warmup] Skipping ${sender.email}: auto warmup is OFF`)
    return
  }
  if (sender.warmupStatus !== 'WARMING') {
    console.log(`[Warmup] Skipping ${sender.email}: status is ${sender.warmupStatus}`)
    return
  }

  const intervalMs = Math.max(3 * 60_000, Math.floor((8 * 60 * 60 * 1000) / Math.max(1, sender.recommendedDailyLimit)))
  if (sender.sentToday >= sender.recommendedDailyLimit) {
    console.log(`[Warmup] Skipping ${sender.email}: daily limit reached (${sender.sentToday}/${sender.recommendedDailyLimit})`)
    return
  }
  if (sender.lastMailSentAt && warmupDeps.now() - sender.lastMailSentAt.getTime() < intervalMs) {
    const waitMs = intervalMs - (warmupDeps.now() - sender.lastMailSentAt.getTime())
    console.log(`[Warmup] Skipping ${sender.email}: cooldown active for ${Math.ceil(waitMs / 60_000)} more minute(s)`)
    return
  }

  const recipient = await chooseWarmupRecipient(sender.id, sender.email)
  if (!recipient) {
    console.log(`[Warmup] No recipient available for ${sender.email}`)
    return
  }

  const warmupMail = await buildOutboundWarmupMail(
    sender.warmupStage,
    sender.displayName,
    getFirstName(recipient.recipientDisplayName)
  )
  try {
    await sendFromAccount(sender.id, recipient.email, warmupMail.subject, warmupMail.body)
    await warmupDeps.prisma.$transaction([
      warmupDeps.prisma.mailAccount.update({
        where: { id: sender.id },
        data: { sentToday: { increment: 1 }, lastMailSentAt: new Date() },
      }),
      warmupDeps.prisma.warmupMailLog.create({
        data: {
          senderMailAccountId: sender.id,
          recipientEmail: recipient.email,
          recipientType: recipient.type,
          recipientMailAccountId: recipient.recipientMailAccountId ?? undefined,
          direction: 'outbound',
          subject: warmupMail.subject,
          body: warmupMail.body,
          status: 'sent',
          stage: sender.warmupStage,
        },
      }),
    ])
    console.log(
      `[Warmup] Sent from ${sender.email} to ${recipient.email} | stage=${sender.warmupStage} | auto=${sender.warmupAutoEnabled}`
    )
    await warmupDeps.mailboxSyncQueue.add(
      'sync-mailbox' as never,
      { mailAccountId: sender.id, reason: 'post-send' } as never,
      { jobId: `mailbox-post-warmup-${sender.id}-${warmupDeps.now()}` }
    )
  } catch (err) {
    await warmupDeps.prisma.warmupMailLog.create({
      data: {
        senderMailAccountId: sender.id,
        recipientEmail: recipient.email,
        recipientType: recipient.type,
        recipientMailAccountId: recipient.recipientMailAccountId ?? undefined,
        direction: 'outbound',
        subject: warmupMail.subject,
        body: warmupMail.body,
        status: classifyWarmupFailure(err),
        stage: sender.warmupStage,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
      })

    if (isAuthGrantFailure(err)) {
      await warmupDeps.prisma.mailAccount.update({
        where: { id: sender.id },
        data: {
          warmupStatus: 'PAUSED',
          warmupPausedAt: new Date(),
          warmupAutoEnabled: false,
        },
      })
      console.log(`[Warmup] Paused ${sender.email} because Gmail auth needs reconnecting`)
    }
    return
  }

  if (recipient.type === 'system' && recipient.recipientMailAccountId && warmupDeps.random() < REPLY_PROBABILITY) {
    const replier = await warmupDeps.prisma.mailAccount.findUnique({ where: { id: recipient.recipientMailAccountId } })
    if (replier && replier.warmupStatus !== 'COLD') {
      const reply = buildReplyMail(sender.displayName, replier.displayName)
      try {
        await sendFromAccount(replier.id, sender.email, reply.subject, reply.body)
        await warmupDeps.prisma.$transaction([
          warmupDeps.prisma.mailAccount.update({
            where: { id: replier.id },
            data: { sentToday: { increment: 1 }, lastMailSentAt: new Date() },
          }),
          warmupDeps.prisma.warmupMailLog.create({
            data: {
              senderMailAccountId: replier.id,
              recipientEmail: sender.email,
              recipientType: 'system',
              recipientMailAccountId: sender.id,
              direction: 'reply',
              subject: reply.subject,
              body: reply.body,
              status: 'sent',
              stage: replier.warmupStage,
            },
          }),
        ])
        await warmupDeps.mailboxSyncQueue.add(
          'sync-mailbox' as never,
          { mailAccountId: replier.id, reason: 'post-send' } as never,
          { jobId: `mailbox-post-reply-${replier.id}-${warmupDeps.now()}` }
        )
      } catch (err) {
        await warmupDeps.prisma.warmupMailLog.create({
          data: {
            senderMailAccountId: replier.id,
            recipientEmail: sender.email,
            recipientType: 'system',
            recipientMailAccountId: sender.id,
            direction: 'reply',
            subject: reply.subject,
            body: reply.body,
            status: classifyWarmupFailure(err),
            stage: replier.warmupStage,
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        })
      }
    }
  }
}

export function startWarmupWorker() {
  const worker = new Worker<WarmupJobData>('warmup-queue', processWarmupJob, {
    connection: getRedisConnection(),
    concurrency: getWorkerConcurrency('warmup'),
  })

  worker.on('completed', (job) => {
    console.log(`[Warmup] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err: Error) => {
    console.error(`[Warmup] Job ${job?.id} failed: ${err.message}`)
  })

  console.log('[Worker] Warmup worker started')
  return worker
}
