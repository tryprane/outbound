import { Queue } from 'bullmq'
import { getBullConnection } from '@/lib/redis'

export interface MailJobData {
  campaignId: string | null
  csvRowId: string | null
  mailAccountId: string
  apiDispatchRequestId?: string | null
  reservationKey?: string | null
  toEmail: string
  subject: string
  body: string
  trackingToken: string
}

let mailQueue: Queue<MailJobData> | undefined

export function getMailQueue() {
  if (!mailQueue) {
    mailQueue = new Queue<MailJobData>('mail-queue', {
      connection: getBullConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { count: 300 },
        removeOnFail: { count: 500 },
      },
    })
  }

  return mailQueue
}
