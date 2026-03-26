import { Queue } from 'bullmq'
import { getBullConnection } from '@/lib/redis'

export interface WhatsAppSessionJobData {
  whatsappAccountId: string
  mode: 'connect' | 'reconnect'
}

export const whatsappSessionQueue = new Queue<WhatsAppSessionJobData>('whatsapp-session-queue', {
  connection: getBullConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
})
