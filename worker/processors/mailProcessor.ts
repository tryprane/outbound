import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import { prisma } from '~/lib/prisma'
import { MailJobData } from '~/queues/mailQueue'
import { mailboxSyncQueue } from '~/queues/mailboxSyncQueue'
import { sendViaGmail, sendViaZoho } from '~/lib/mailSenders'
import { releaseMailAccountReservation } from '~/lib/apiDispatchPool'

function appendTrackingPixel(html: string, trackingToken: string): string {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000'
  const pixelUrl = `${baseUrl}/api/track/open?token=${encodeURIComponent(trackingToken)}`
  const pixel = `<img src="${pixelUrl}" alt="" width="1" height="1" style="display:none!important;opacity:0;border:0;outline:none;text-decoration:none;" />`
  const trimmed = html.trim()

  if (/<\/body\s*>/i.test(trimmed)) {
    return trimmed.replace(/<\/body\s*>/i, `${pixel}</body>`)
  }

  return `${trimmed}${pixel}`
}

async function assertRecentSenderReputation(mailAccountId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentMail = await prisma.sentMail.findMany({
    where: {
      mailAccountId,
      sentAt: { gte: since },
    },
    select: { status: true },
    take: 50,
  })

  if (recentMail.length < 8) {
    return
  }

  const failed = recentMail.filter((mail) => mail.status === 'failed').length
  const bounced = recentMail.filter((mail) => mail.status === 'bounced').length
  const bounceRate = bounced / recentMail.length
  const failureRate = (failed + bounced) / recentMail.length

  if (bounceRate >= 0.15 || failureRate >= 0.25) {
    throw new Error(
      `Mail account ${mailAccountId} is temporarily blocked by recent delivery reputation (${Math.round(bounceRate * 100)}% bounce, ${Math.round(failureRate * 100)}% failure over ${recentMail.length} sends).`
    )
  }
}

function classifyMailFailure(error: unknown): 'failed' | 'bounced' {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  const bounceSignals = [
    'mailbox unavailable',
    'user unknown',
    'recipient rejected',
    'invalid recipient',
    'no such user',
    'address rejected',
    '550',
    '551',
    '552',
    '553',
    '554',
    'bounce',
  ]
  return bounceSignals.some((signal) => message.includes(signal)) ? 'bounced' : 'failed'
}

async function processMailJob(job: Job<MailJobData>) {
  const { campaignId, csvRowId, mailAccountId, apiDispatchRequestId, reservationKey, toEmail, subject, body, trackingToken } = job.data
  const renderedBody = appendTrackingPixel(body, trackingToken)

  console.log(`[MailProcessor] Sending to ${toEmail} via account ${mailAccountId}`)

  const account = await prisma.mailAccount.findUnique({ where: { id: mailAccountId } })
  if (!account) throw new Error(`Mail account ${mailAccountId} not found`)
  if (!account.isActive || account.warmupStatus !== 'WARMED') {
    throw new Error(`Mail account ${mailAccountId} is not eligible for sending (requires ACTIVE + WARMED).`)
  }
  if (account.mailboxHealthStatus === 'at_risk' || account.mailboxHealthStatus === 'paused') {
    throw new Error(`Mail account ${mailAccountId} is blocked by mailbox health status ${account.mailboxHealthStatus}.`)
  }
  if (account.mailboxHealthScore > 0 && account.mailboxHealthScore < 55) {
    throw new Error(`Mail account ${mailAccountId} is blocked because mailbox health score is too low (${account.mailboxHealthScore}).`)
  }
  if (account.mailboxSyncStatus === 'error') {
    throw new Error(`Mail account ${mailAccountId} has mailbox sync errors and is temporarily blocked.`)
  }
  await assertRecentSenderReputation(mailAccountId)

  try {
    let providerMessageId: string | null = null
    if (account.type === 'zoho') {
      const result = await sendViaZoho(mailAccountId, toEmail, subject, renderedBody)
      providerMessageId = result.providerMessageId
    } else if (account.type === 'gmail') {
      const result = await sendViaGmail(mailAccountId, toEmail, subject, renderedBody)
      providerMessageId = result.providerMessageId
    } else {
      throw new Error(`Unknown account type: ${account.type}`)
    }

    const operations = [
      prisma.sentMail.create({
        data: {
          id: trackingToken,
          campaignId,
          csvRowId,
          mailAccountId,
          apiDispatchRequestId,
          toEmail,
          subject,
          body: renderedBody,
          status: 'sent',
        },
      }),
      prisma.mailAccount.update({
        where: { id: mailAccountId },
        data: { sentToday: { increment: 1 }, lastMailSentAt: new Date() },
      }),
      ...(campaignId
        ? [
            prisma.campaignMailAccount.update({
              where: { campaignId_mailAccountId: { campaignId, mailAccountId } },
              data: { sentCount: { increment: 1 }, lastSentAt: new Date() },
            }),
          ]
        : []),
      ...(apiDispatchRequestId
        ? [
            prisma.apiDispatchRequest.update({
              where: { id: apiDispatchRequestId },
              data: {
                status: 'SENT',
                processedAt: new Date(),
                providerMessageId,
                errorMessage: null,
              },
            }),
          ]
        : []),
    ]

    await prisma.$transaction(operations)
    await releaseMailAccountReservation(mailAccountId, reservationKey)

    console.log(`[MailProcessor] Sent to ${toEmail}`)
    await mailboxSyncQueue.add(
      'sync-mailbox' as never,
      { mailAccountId, reason: 'post-send' } as never,
      { jobId: `mailbox-post-send-${mailAccountId}-${Date.now()}` }
    )
  } catch (err) {
    const maxAttempts = job.opts?.attempts ?? 3
    const isLastAttempt = (job.attemptsMade ?? 0) >= maxAttempts - 1
    if (isLastAttempt) {
      const status = classifyMailFailure(err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      const operations = [
        prisma.sentMail.create({
          data: {
            campaignId,
            csvRowId,
            mailAccountId,
            apiDispatchRequestId,
            toEmail,
            subject,
            body,
            status,
            errorMessage,
          },
        }),
        ...(status === 'bounced'
          ? [
              prisma.unsubscribeList.upsert({
                where: { email: toEmail.toLowerCase() },
                create: { email: toEmail.toLowerCase() },
                update: {},
              }),
            ]
          : []),
        ...(apiDispatchRequestId
          ? [
              prisma.apiDispatchRequest.update({
                where: { id: apiDispatchRequestId },
                data: {
                  status: 'FAILED',
                  errorMessage,
                  processedAt: new Date(),
                },
              }),
            ]
          : []),
      ]
      await prisma.$transaction(operations)
      await releaseMailAccountReservation(mailAccountId, reservationKey)
      console.error(`[MailProcessor] Final failure to ${toEmail}:`, err)
    }
    throw err
  }
}

export function startMailWorker() {
  const worker = new Worker<MailJobData>('mail-queue', processMailJob, {
    connection: getRedisConnection(),
    concurrency: getWorkerConcurrency('mail'),
  })

  worker.on('completed', (job) => {
    console.log(`[MailProcessor] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err: Error) => {
    console.error(`[MailProcessor] Job ${job?.id} failed: ${err.message}`)
  })

  console.log('[Worker] Mail worker started')
  return worker
}
