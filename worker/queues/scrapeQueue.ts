import { Queue } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'

export interface ScrapeJobData {
  csvRowId: string
  url: string
  campaignType: 'indian' | 'international'
  extract: Array<'email' | 'phone'>
}

export const scrapeQueue = new Queue<ScrapeJobData>('scrape-queue', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 300 },
  },
})
