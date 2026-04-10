import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import { prisma } from '~/lib/prisma'
import { WarmupJobData } from '~/queues/warmupQueue'
import { mailboxSyncQueue } from '~/queues/mailboxSyncQueue'
import { sendViaGmail, sendViaZoho } from '~/lib/mailSenders'
import { generateWarmupMailWithGemini } from '~/lib/geminiWarmup'
import {
  DEFAULT_WARMUP_SETTINGS,
  WARMUP_SETTINGS_KEY,
  parseWarmupSettingsValue,
} from '~/lib/warmupSettings'

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

function pickLeastUsedCandidate<T>(options: {
  candidates: T[]
  getKey: (candidate: T) => string
  countMap: Map<string, number>
}) {
  if (options.candidates.length === 0) return null

  let lowestCount = Number.POSITIVE_INFINITY
  for (const candidate of options.candidates) {
    const count = options.countMap.get(options.getKey(candidate)) ?? 0
    if (count < lowestCount) lowestCount = count
  }

  const leastUsed = options.candidates.filter(
    (candidate) => (options.countMap.get(options.getKey(candidate)) ?? 0) === lowestCount
  )
  const totalInteractions = Array.from(options.countMap.values()).reduce((sum, count) => sum + count, 0)
  const index = totalInteractions % leastUsed.length
  return leastUsed[index] ?? leastUsed[0] ?? null
}

function buildWarmupMail(stage: number, senderName: string, recipientName: string) {
  const subjectVariants = [
    'Quick hello',
    'Checking in',
    'Small note',
    'Thought of this',
    'Hope all is well',
    'Short hello',
    'Quick thought',
    'Simple check-in',
    'Friendly note',
    'Hello there',
    'Midweek hello',
    'Keeping in touch',
    'Just saying hi',
    'Brief note from me',
    'Dropping a line',
    'Thinking of you',
    'Catching up',
    'A small update',
    'Passing along a hello',
    'Quick ping',
    'Reaching out briefly',
    'Just a moment',
    'Before the week ends',
    'Morning hello',
    'End of week note',
    'Light touch base',
    'A short word',
    'Staying connected',
    'Warm hello',
    'Little note from me',
    'While I had a second',
    'Keeping the thread warm',
    'Short and simple',
    'A brief word',
    'Gentle reminder I exist',
    'Saying hello while here',
    'Between meetings hello',
    'A note from my desk',
    'Sharing a quick hello',
    'Before the day runs away',
  ]
  const subject = pickTemplate(subjectVariants, stage + senderName.length)
  const openingVariants = [
    `Hi ${recipientName},`,
    `Hello ${recipientName},`,
    `Hey ${recipientName},`,
    `Hi there,`,
    `Good day ${recipientName},`,
    `Hello there,`,
    `Hope you're well,`,
    `Hi ${recipientName} —`,
    `Hey there,`,
    `Hi, ${recipientName}`,
    `Hello, ${recipientName}`,
    `Greetings ${recipientName},`,
    `Good morning ${recipientName},`,
    `Good afternoon ${recipientName},`,
    `Howdy ${recipientName},`,
  ]
  const opening = pickTemplate(openingVariants, stage + senderName.length)
  const middleVariants = [
    'Hope your day is going smoothly. Sending a quick hello from my side.',
    'Just checking in with a short note. No action needed, only keeping the thread warm.',
    'Wanted to leave a small note here so we stay in touch naturally.',
    'I was going through a few things today and thought of this conversation.',
    'Hope the week has been fairly smooth on your side.',
    'Keeping this brief, but I wanted to say hello while I had a moment.',
    'A quick message from me while I was clearing a few replies.',
    'Thought it was a nice time to send a light check-in.',
    'Just a short, friendly note so the thread stays active.',
    'Dropping a simple hello here before the day gets busy.',
    'Wanted to stay in touch and thought a small note would do.',
    'I find it easier to keep threads warm with a quick message now and then.',
    'Nothing urgent here — just keeping the line open.',
    'Thought I would drop a light message before another week slips by.',
    'Hope things are ticking along well on your end.',
    'Short note from me while I had a quiet moment here.',
    'Just a friendly ping to stay connected.',
    'Sending this while I had a chance between tasks.',
    'Wanted to reach out briefly while I was clearing my inbox.',
    'Hope the month has been off to a solid start for you.',
    'Sharing a small hello while I have the moment.',
    'No need to reply, just staying in touch.',
    'A light check-in from my end — hope things are good.',
    'Dropping a warm note before the week wraps up.',
    'Thought of this thread and wanted to send a quick word.',
    'Nothing specific to flag — just a friendly nudge.',
    "Hope you had a restful weekend. Sending a quick note to keep things warm.",
    'Just touching base lightly — hope all is going well.',
    'A short message from me to keep the channel warm.',
    'I try to keep up with conversations I care about. Sending this your way.',
    "Making sure this thread doesn't go cold — a hello from my side.",
    'Thought a brief message here would be a nice gesture.',
    'Keeping things casual — just wanted to say hello.',
    "A small reminder that I'm here and open for a chat.",
    'Sending a light note while I think of it.',
    "This is just a friendly way of staying on your radar.",
    "Quick hello before the day takes over — hope yours is going well.",
    'Checking in the way one does when they want to stay connected.',
    'A warm note from me — no urgency, just presence.',
    'Sending this while the thought is fresh — hope all is well with you.',
  ]
  const middle = pickTemplate(middleVariants, stage * 3 + recipientName.length)
  const closingVariants = [
    `<p>Hope the rest of the day goes well.</p><p>Best,<br/>${senderName}</p>`,
    `<p>No rush on anything, just keeping in touch.</p><p>Thanks,<br/>${senderName}</p>`,
    `<p>Always happy to keep the conversation open.</p><p>Regards,<br/>${senderName}</p>`,
    `<p>Thought a light note here would be useful.</p><p>Best regards,<br/>${senderName}</p>`,
    `<p>Wanted to keep this short and natural.</p><p>Thanks again,<br/>${senderName}</p>`,
    `<p>Hope to stay connected here.</p><p>Best,<br/>${senderName}</p>`,
    `<p>Wishing you a smooth week ahead.</p><p>Regards,<br/>${senderName}</p>`,
    `<p>That was all from my side for now.</p><p>Best,<br/>${senderName}</p>`,
    `<p>Have a great rest of the week.</p><p>Warm regards,<br/>${senderName}</p>`,
    `<p>Take care and stay well.</p><p>Best,<br/>${senderName}</p>`,
    `<p>Feel free to reach out anytime.</p><p>Cheers,<br/>${senderName}</p>`,
    `<p>Hope to hear from you soon.</p><p>All the best,<br/>${senderName}</p>`,
    `<p>Looking forward to staying in touch.</p><p>Best,<br/>${senderName}</p>`,
    `<p>Have a wonderful day ahead.</p><p>Kind regards,<br/>${senderName}</p>`,
    `<p>Keep up the great work on your end.</p><p>Regards,<br/>${senderName}</p>`,
    `<p>Wishing you a productive day.</p><p>Best,<br/>${senderName}</p>`,
    `<p>Hope this week brings good things your way.</p><p>Warmly,<br/>${senderName}</p>`,
    `<p>Stay well and take good care.</p><p>Best regards,<br/>${senderName}</p>`,
    `<p>All the best for the days ahead.</p><p>Sincerely,<br/>${senderName}</p>`,
    `<p>Hope things continue going smoothly for you.</p><p>Best,<br/>${senderName}</p>`,
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

    const chosen = pickLeastUsedCandidate({
      candidates: eligibleSystemCandidates,
      getKey: (candidate) => candidate.id,
      countMap,
    })
    if (!chosen) return null
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
    const chosen = pickLeastUsedCandidate({
      candidates: eligibleCustomRecipients,
      getKey: (candidate) => candidate.email,
      countMap,
    })
    if (!chosen) return null
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

    const chosen = pickLeastUsedCandidate({
      candidates: eligibleFallbackCandidates,
      getKey: (candidate) => candidate.id,
      countMap,
    })
    if (!chosen) return null
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

async function loadWarmupSettings() {
  const record = await warmupDeps.prisma.systemSetting.findUnique({
    where: { key: WARMUP_SETTINGS_KEY },
  })

  return parseWarmupSettingsValue(record?.value) ?? DEFAULT_WARMUP_SETTINGS
}

async function processWarmupJob(job: Job<WarmupJobData>) {
  const { mailAccountId } = job.data
  const settings = await loadWarmupSettings()
  if (!settings.globalEnabled) {
    console.log(`[Warmup] Skipping ${mailAccountId}: global warmup is OFF`)
    return
  }

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
  if (sender.apiReservedUntil && sender.apiReservedUntil > new Date()) {
    console.log(`[Warmup] Skipping ${sender.email}: sender is reserved for campaign/API mail`)
    return
  }

  const effectiveDailyLimit = Math.min(sender.recommendedDailyLimit, sender.dailyLimit)
  const intervalMs = Math.max(3 * 60_000, Math.floor((8 * 60 * 60 * 1000) / Math.max(1, effectiveDailyLimit)))
  if (sender.sentToday >= effectiveDailyLimit) {
    console.log(`[Warmup] Skipping ${sender.email}: daily limit reached (${sender.sentToday}/${effectiveDailyLimit})`)
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
