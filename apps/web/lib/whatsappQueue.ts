import { Queue } from 'bullmq'
import { getBullConnection } from '@/lib/redis'

export interface WhatsAppJobData {
  campaignId: string | null
  csvRowId: string | null
  whatsappAccountId: string
  apiDispatchRequestId?: string | null
  reservationKey?: string | null
  toPhone: string
  message: string
}

let whatsappQueue: Queue<WhatsAppJobData> | undefined

export function getWhatsAppQueue() {
  if (!whatsappQueue) {
    whatsappQueue = new Queue<WhatsAppJobData>('whatsapp-queue', {
      connection: getBullConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { count: 300 },
        removeOnFail: { count: 500 },
      },
    })
  }

  return whatsappQueue
}
