import { Queue } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'

export interface MailJobData {
  campaignId: string
  csvRowId: string
  mailAccountId: string
  toEmail: string
  subject: string
  body: string
  trackingToken: string
}

export const mailQueue = new Queue<MailJobData>('mail-queue', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 300 },
    removeOnFail: { count: 500 },
  },
})
