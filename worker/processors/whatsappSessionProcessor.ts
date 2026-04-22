import { Job, Worker } from 'bullmq'
import { prisma } from '~/lib/prisma'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import { clearWhatsAppSessionFiles, connectWhatsAppSession, resetWhatsAppSession } from '~/lib/whatsappBaileys'
import { WhatsAppSessionJobData } from '~/queues/whatsappSessionQueue'

async function processWhatsAppSessionJob(job: Job<WhatsAppSessionJobData>) {
  const { whatsappAccountId, sessionKey, mode } = job.data
  const account = await prisma.whatsAppAccount.findUnique({
    where: { id: whatsappAccountId },
    select: { id: true, sessionKey: true, isActive: true },
  })

  const resolvedSessionKey = sessionKey || account?.sessionKey || null

  if (mode === 'delete') {
    await resetWhatsAppSession(whatsappAccountId)
    if (resolvedSessionKey) {
      await clearWhatsAppSessionFiles(resolvedSessionKey)
    }
    return
  }

  if (!account) throw new Error('WhatsApp account not found')
  if (!account.isActive) throw new Error('WhatsApp account is inactive')

  if (mode === 'reconnect') {
    await resetWhatsAppSession(account.id)
    await clearWhatsAppSessionFiles(account.sessionKey)
  }

  await prisma.whatsAppAccount.update({
    where: { id: account.id },
    data: {
      connectionStatus: 'DISCONNECTED',
      lastQr: null,
      lastError: null,
    },
  })

  await connectWhatsAppSession(account.id, account.sessionKey)
}

export function startWhatsAppSessionWorker() {
  const worker = new Worker<WhatsAppSessionJobData>('whatsapp-session-queue', processWhatsAppSessionJob, {
    connection: getRedisConnection(),
    concurrency: getWorkerConcurrency('whatsappSession'),
  })

  worker.on('completed', (job) => {
    console.log(`[WhatsAppSessionProcessor] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err: Error) => {
    console.error(`[WhatsAppSessionProcessor] Job ${job?.id} failed: ${err.message}`)
  })

  console.log('[Worker] WhatsApp session worker started')
  return worker
}
