import { Queue } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'

export interface CampaignJobData {
  campaignId: string
}

export const campaignQueue = new Queue<CampaignJobData>('campaign-queue', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
})
