import { Queue } from 'bullmq'
import { getBullConnection } from '@/lib/redis'

export interface WhatsAppSessionJobData {
  whatsappAccountId: string
  mode: 'connect' | 'reconnect'
}

let whatsappSessionQueue: Queue<WhatsAppSessionJobData> | undefined

export function getWhatsAppSessionQueue() {
  if (!whatsappSessionQueue) {
    whatsappSessionQueue = new Queue<WhatsAppSessionJobData>('whatsapp-session-queue', {
      connection: getBullConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    })
  }

  return whatsappSessionQueue
}
