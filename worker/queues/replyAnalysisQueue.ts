import { Queue } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'

export interface ReplyAnalysisJobData {
  mailboxMessageId: string
  reason?: 'detected' | 'opened' | 'reply-thread-view'
  force?: boolean
}

export const replyAnalysisQueue = new Queue<ReplyAnalysisJobData>('reply-analysis-queue', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: { count: 300 },
    removeOnFail: { count: 500 },
  },
})
