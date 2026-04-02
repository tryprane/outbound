import { Worker, Job } from 'bullmq'
import { prisma } from '~/lib/prisma'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import {
  pickNextPooledMailAccount,
  pickNextPooledWhatsAppAccount,
  releaseMailAccountReservation,
  releaseWhatsAppAccountReservation,
} from '~/lib/apiDispatchPool'
import { ApiDispatchJobData } from '~/queues/apiDispatchQueue'
import { mailQueue, MailJobData } from '~/queues/mailQueue'
import { whatsappQueue, WhatsAppJobData } from '~/queues/whatsappQueue'

async function processApiDispatchJob(job: Job<ApiDispatchJobData>) {
  const requestId = job.data.apiDispatchRequestId
  const reservationKey = `api:${requestId}`
  let reservedMailAccountId: string | null = null
  let reservedWhatsAppAccountId: string | null = null

  try {
    const request = await prisma.apiDispatchRequest.findUnique({
      where: { id: requestId },
    })

    if (!request) {
      throw new Error(`API dispatch request ${requestId} not found`)
    }

    if (request.status === 'SENT' || request.status === 'FAILED' || request.status === 'REJECTED_NO_CAPACITY') {
      return
    }

    await prisma.apiDispatchRequest.update({
      where: { id: request.id },
      data: {
        status: 'PROCESSING',
        errorMessage: null,
      },
    })

    if (request.channel === 'EMAIL') {
      const account = await pickNextPooledMailAccount(reservationKey)
      if (!account) {
        await prisma.apiDispatchRequest.update({
          where: { id: request.id },
          data: {
            status: 'REJECTED_NO_CAPACITY',
            errorMessage: 'No eligible email sender is currently available.',
            processedAt: new Date(),
          },
        })
        return
      }
      reservedMailAccountId = account.id

      await prisma.apiDispatchRequest.update({
        where: { id: request.id },
        data: {
          selectedMailAccountId: account.id,
        },
      })

      const mailJob: MailJobData = {
        campaignId: null,
        csvRowId: null,
        mailAccountId: account.id,
        apiDispatchRequestId: request.id,
        reservationKey,
        toEmail: request.requestedTo,
        subject: request.subject || 'API message',
        body: request.content,
        trackingToken: request.id,
      }

      await mailQueue.add('send-mail' as never, mailJob as never, {
        jobId: `api-mail-${request.id}`,
      })
      return
    }

    const account = await pickNextPooledWhatsAppAccount(reservationKey)
    if (!account) {
      await prisma.apiDispatchRequest.update({
        where: { id: request.id },
        data: {
          status: 'REJECTED_NO_CAPACITY',
          errorMessage: 'No eligible WhatsApp sender is currently available.',
          processedAt: new Date(),
        },
      })
      return
    }
    reservedWhatsAppAccountId = account.id

    await prisma.apiDispatchRequest.update({
      where: { id: request.id },
      data: {
        selectedWhatsAppAccountId: account.id,
      },
    })

    const whatsappJob: WhatsAppJobData = {
      campaignId: null,
      csvRowId: null,
      whatsappAccountId: account.id,
      apiDispatchRequestId: request.id,
      reservationKey,
      toPhone: request.requestedTo,
      message: request.content,
    }

    await whatsappQueue.add('send-whatsapp' as never, whatsappJob as never, {
      jobId: `api-whatsapp-${request.id}`,
    })
  } catch (error) {
    await prisma.apiDispatchRequest.updateMany({
      where: {
        id: requestId,
        status: { in: ['QUEUED', 'PROCESSING'] },
      },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
        processedAt: new Date(),
      },
    })
    const releaseOperations: Promise<unknown>[] = []
    if (reservedMailAccountId) {
      releaseOperations.push(releaseMailAccountReservation(reservedMailAccountId, reservationKey))
    }
    if (reservedWhatsAppAccountId) {
      releaseOperations.push(releaseWhatsAppAccountReservation(reservedWhatsAppAccountId, reservationKey))
    }
    await Promise.all(releaseOperations)
    throw error
  }
}

export function startApiDispatchWorker() {
  const worker = new Worker<ApiDispatchJobData>('api-dispatch-queue', processApiDispatchJob, {
    connection: getRedisConnection(),
    concurrency: getWorkerConcurrency('apiDispatch'),
  })

  worker.on('completed', (job) => {
    console.log(`[ApiDispatchProcessor] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err: Error) => {
    console.error(`[ApiDispatchProcessor] Job ${job?.id} failed: ${err.message}`)
  })

  console.log('[Worker] API dispatch worker started')
  return worker
}
