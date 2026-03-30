import { Queue } from 'bullmq'
import { getBullConnection } from '@/lib/redis'

export interface MailboxSyncJobData {
  mailAccountId: string
  reason?: 'scheduled' | 'manual' | 'post-send'
}

let mailboxSyncQueue: Queue<MailboxSyncJobData> | undefined

export function getMailboxSyncQueue() {
  if (!mailboxSyncQueue) {
    mailboxSyncQueue = new Queue<MailboxSyncJobData>('mailbox-sync-queue', {
      connection: getBullConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 400 },
      },
    })
  }

  return mailboxSyncQueue
}
