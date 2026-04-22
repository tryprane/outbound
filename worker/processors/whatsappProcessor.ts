import { Worker, Job } from 'bullmq'
import { prisma } from '~/lib/prisma'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import { WhatsAppJobData } from '~/queues/whatsappQueue'
import { recordManagedWhatsAppOutbound, sendWhatsAppText } from '~/lib/whatsappBaileys'
import { releaseWhatsAppAccountReservation } from '~/lib/apiDispatchPool'

async function processWhatsAppJob(job: Job<WhatsAppJobData>) {
  const {
    campaignId,
    csvRowId,
    whatsappAccountId,
    apiDispatchRequestId,
    reservationKey,
    source,
    toPhone,
    message,
  } = job.data
  const account = await prisma.whatsAppAccount.findUnique({ where: { id: whatsappAccountId } })
  if (!account) throw new Error('WhatsApp account not found')
  if (!account.isActive || account.connectionStatus !== 'CONNECTED') {
    throw new Error('WhatsApp account is not active/connected')
  }

  try {
    const sendResult = await sendWhatsAppText(account.id, account.sessionKey, toPhone, message)
    const sentAt = new Date()
    await recordManagedWhatsAppOutbound(account.id, toPhone, {
      providerMessageId: sendResult.providerMessageId,
      body: message,
      status: 'sent',
      sentAt,
    })
    const operations = [
      prisma.sentWhatsAppMessage.create({
        data: {
          campaignId,
          csvRowId,
          whatsappAccountId,
          providerMessageId: sendResult.providerMessageId,
          apiDispatchRequestId,
          toPhone,
          message,
          status: 'sent',
          sentAt,
        },
      }),
      prisma.whatsAppAccount.update({
        where: { id: whatsappAccountId },
        data: {
          ...(source === 'inbox' ? {} : { sentToday: { increment: 1 } }),
          ...(source === 'inbox' ? {} : { lastMessageSentAt: new Date() }),
        },
      }),
      ...(campaignId
        ? [
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
          ]
        : []),
      ...(apiDispatchRequestId
        ? [
            prisma.apiDispatchRequest.update({
              where: { id: apiDispatchRequestId },
              data: {
                status: 'SENT',
                processedAt: sentAt,
                providerMessageId: sendResult.providerMessageId || account.phoneNumber || account.displayName,
                errorMessage: null,
              },
            }),
          ]
        : []),
    ]
    await prisma.$transaction(operations)
    await releaseWhatsAppAccountReservation(whatsappAccountId, reservationKey)
  } catch (err) {
    const maxAttempts = job.opts?.attempts ?? 3
    const isLastAttempt = (job.attemptsMade ?? 0) >= maxAttempts - 1
    if (isLastAttempt) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const operations = [
        prisma.sentWhatsAppMessage.create({
          data: {
            campaignId,
            csvRowId,
            whatsappAccountId,
            apiDispatchRequestId,
            toPhone,
            message,
            status: 'failed',
            errorMessage,
          },
        }),
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
      await releaseWhatsAppAccountReservation(whatsappAccountId, reservationKey)
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
