import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import { prisma } from '~/lib/prisma'
import { MailJobData } from '~/queues/mailQueue'
import { sendViaGmail, sendViaZoho } from '~/lib/mailSenders'

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

async function processMailJob(job: Job<MailJobData>) {
  const { campaignId, csvRowId, mailAccountId, toEmail, subject, body, trackingToken } = job.data
  const renderedBody = appendTrackingPixel(body, trackingToken)

  console.log(`[MailProcessor] Sending to ${toEmail} via account ${mailAccountId}`)

  const account = await prisma.mailAccount.findUnique({ where: { id: mailAccountId } })
  if (!account) throw new Error(`Mail account ${mailAccountId} not found`)
  if (!account.isActive || account.warmupStatus !== 'WARMED') {
    throw new Error(`Mail account ${mailAccountId} is not eligible for sending (requires ACTIVE + WARMED).`)
  }

  try {
    if (account.type === 'zoho') {
      await sendViaZoho(mailAccountId, toEmail, subject, renderedBody)
    } else if (account.type === 'gmail') {
      await sendViaGmail(mailAccountId, toEmail, subject, renderedBody)
    } else {
      throw new Error(`Unknown account type: ${account.type}`)
    }

    await prisma.$transaction([
      prisma.sentMail.create({
        data: {
          id: trackingToken,
          campaignId,
          csvRowId,
          mailAccountId,
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
      prisma.campaignMailAccount.update({
        where: { campaignId_mailAccountId: { campaignId, mailAccountId } },
        data: { sentCount: { increment: 1 }, lastSentAt: new Date() },
      }),
    ])

    console.log(`[MailProcessor] Sent to ${toEmail}`)
  } catch (err) {
    const maxAttempts = job.opts?.attempts ?? 3
    const isLastAttempt = (job.attemptsMade ?? 0) >= maxAttempts - 1
    if (isLastAttempt) {
      await prisma.sentMail.create({
        data: {
          campaignId,
          csvRowId,
          mailAccountId,
          toEmail,
          subject,
          body,
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      })
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
