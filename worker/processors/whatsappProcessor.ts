import { Worker, Job } from 'bullmq'
import { prisma } from '~/lib/prisma'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import { WhatsAppJobData } from '~/queues/whatsappQueue'
import { sendWhatsAppText } from '~/lib/whatsappBaileys'

async function processWhatsAppJob(job: Job<WhatsAppJobData>) {
  const { campaignId, csvRowId, whatsappAccountId, toPhone, message } = job.data
  const account = await prisma.whatsAppAccount.findUnique({ where: { id: whatsappAccountId } })
  if (!account) throw new Error('WhatsApp account not found')
  if (!account.isActive || account.connectionStatus !== 'CONNECTED') {
    throw new Error('WhatsApp account is not active/connected')
  }

  try {
    await sendWhatsAppText(account.id, account.sessionKey, toPhone, message)
    await prisma.$transaction([
      prisma.sentWhatsAppMessage.create({
        data: {
          campaignId,
          csvRowId,
          whatsappAccountId,
          toPhone,
          message,
          status: 'sent',
        },
      }),
      prisma.whatsAppAccount.update({
        where: { id: whatsappAccountId },
        data: {
          sentToday: { increment: 1 },
          lastMessageSentAt: new Date(),
        },
      }),
      prisma.campaignWhatsAppAccount.update({
        where: {
          campaignId_whatsappAccountId: {
            campaignId,
            whatsappAccountId,
          },
        },
        data: {
          sentCount: { increment: 1 },
          lastSentAt: new Date(),
        },
      }),
    ])
  } catch (err) {
    const maxAttempts = job.opts?.attempts ?? 3
    const isLastAttempt = (job.attemptsMade ?? 0) >= maxAttempts - 1
    if (isLastAttempt) {
      await prisma.sentWhatsAppMessage.create({
        data: {
          campaignId,
          csvRowId,
          whatsappAccountId,
          toPhone,
          message,
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      })
    }
    throw err
  }
}

export function startWhatsAppWorker() {
  const worker = new Worker<WhatsAppJobData>('whatsapp-queue', processWhatsAppJob, {
    connection: getRedisConnection(),
    concurrency: getWorkerConcurrency('whatsapp'),
  })

  worker.on('completed', (job) => {
    console.log(`[WhatsAppProcessor] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err: Error) => {
    console.error(`[WhatsAppProcessor] Job ${job?.id} failed: ${err.message}`)
  })

  console.log('[Worker] WhatsApp worker started')
  return worker
}
