import { Queue } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'

export interface ApiDispatchJobData {
  apiDispatchRequestId: string
}

export const apiDispatchQueue = new Queue<ApiDispatchJobData>('api-dispatch-queue', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 300 },
    removeOnFail: { count: 500 },
  },
})
