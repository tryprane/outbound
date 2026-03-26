import { Queue } from 'bullmq'
import { getBullConnection } from '@/lib/redis'

export interface WarmupJobData {
  mailAccountId: string
}

let warmupQueue: Queue<WarmupJobData> | undefined

export function getWarmupQueue() {
  if (!warmupQueue) {
    warmupQueue = new Queue<WarmupJobData>('warmup-queue', {
      connection: getBullConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: { count: 300 },
        removeOnFail: { count: 400 },
      },
    })
  }

  return warmupQueue
}
