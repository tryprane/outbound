import { Queue } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'

export interface WhatsAppJobData {
  campaignId: string | null
  csvRowId: string | null
  whatsappAccountId: string
  apiDispatchRequestId?: string | null
  reservationKey?: string | null
  source?: 'campaign' | 'api' | 'inbox'
  toPhone: string
  message: string
}

export const whatsappQueue = new Queue<WhatsAppJobData>('whatsapp-queue', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 300 },
    removeOnFail: { count: 500 },
  },
})
