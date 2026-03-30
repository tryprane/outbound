import { Queue } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'

export interface MailboxSyncJobData {
  mailAccountId: string
  reason?: 'scheduled' | 'manual' | 'post-send'
}

export const mailboxSyncQueue = new Queue<MailboxSyncJobData>('mailbox-sync-queue', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 400 },
  },
})
