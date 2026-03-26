import { Queue } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'

export interface WarmupJobData {
  mailAccountId: string
}

export const warmupQueue = new Queue<WarmupJobData>('warmup-queue', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: { count: 300 },
    removeOnFail: { count: 400 },
  },
})
