import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import { prisma } from '~/lib/prisma'
import { ScrapeJobData } from '~/queues/scrapeQueue'

const SCRAPER_SERVICE_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8000'

async function processScrapeJob(job: Job<ScrapeJobData>) {
  const { csvRowId, url, campaignType, extract } = job.data

  console.log(`[ScrapeProcessor] Row ${csvRowId} — scraping ${url}`)

  // Mark as running
  await prisma.csvRow.update({
    where: { id: csvRowId },
    data: { scrapeStatus: 'running' },
  })

  try {
    const response = await fetch(`${SCRAPER_SERVICE_URL}/scrape/website`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, campaign_type: campaignType, extract }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      throw new Error(`Scraper responded ${response.status}: ${await response.text()}`)
    }

    const result = (await response.json()) as { email?: string; phone?: string }

    await prisma.csvRow.update({
      where: { id: csvRowId },
      data: {
        scrapedEmail: result.email ?? null,
        scrapedPhone: result.phone ?? null,
        scrapeStatus: 'done',
      },
    })

    console.log(`[ScrapeProcessor] Row ${csvRowId} done — email: ${result.email}, phone: ${result.phone}`)
    return result
  } catch (err) {
    await prisma.csvRow.update({
      where: { id: csvRowId },
      data: { scrapeStatus: 'failed' },
    })
    throw err
  }
}

export function startScrapeWorker() {
  const worker = new Worker<ScrapeJobData>('scrape-queue', processScrapeJob, {
    connection: getRedisConnection(),
    concurrency: getWorkerConcurrency('scrape'),
  })

  worker.on('completed', (job) => {
    console.log(`[ScrapeProcessor] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err: Error) => {
    console.error(`[ScrapeProcessor] Job ${job?.id} failed:`, err.message)
  })

  console.log('[Worker] Scrape worker started')
  return worker
}
