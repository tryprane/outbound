import { Queue } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'

export interface MailboxInteractionJobData {
  mailboxMessageId: string
  stage?: 'rescue' | 'open' | 'reply'
}

export const mailboxInteractionQueue = new Queue<MailboxInteractionJobData>('mailbox-interaction-queue', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: { count: 300 },
    removeOnFail: { count: 400 },
  },
})
