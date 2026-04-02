import { Queue } from 'bullmq'
import { getBullConnection } from '@/lib/redis'

export interface ApiDispatchJobData {
  apiDispatchRequestId: string
}

let apiDispatchQueue: Queue<ApiDispatchJobData> | undefined

export function getApiDispatchQueue() {
  if (!apiDispatchQueue) {
    apiDispatchQueue = new Queue<ApiDispatchJobData>('api-dispatch-queue', {
      connection: getBullConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 300 },
        removeOnFail: { count: 500 },
      },
    })
  }

  return apiDispatchQueue
}
