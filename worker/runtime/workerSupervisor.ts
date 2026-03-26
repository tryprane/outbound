import type { Worker } from 'bullmq'
import { campaignQueue } from '~/queues/campaignQueue'
import { mailQueue } from '~/queues/mailQueue'
import { scrapeQueue } from '~/queues/scrapeQueue'
import { warmupQueue } from '~/queues/warmupQueue'
import { whatsappQueue } from '~/queues/whatsappQueue'
import { whatsappSessionQueue } from '~/queues/whatsappSessionQueue'
import { startCampaignWorker } from '~/processors/campaignProcessor'
import { startMailWorker } from '~/processors/mailProcessor'
import { startScrapeWorker } from '~/processors/scrapeProcessor'
import { startWarmupWorker } from '~/processors/warmupProcessor'
import { startWhatsAppWorker } from '~/processors/whatsappProcessor'
import { startWhatsAppSessionWorker } from '~/processors/whatsappSessionProcessor'

type QueueName =
  | 'campaign'
  | 'mail'
  | 'scrape'
  | 'warmup'
  | 'whatsapp'
  | 'whatsappSession'

type QueueState = {
  queueName: QueueName
  priority: number
  idleCloseMs: number
  getCounts: () => Promise<{ waiting: number; active: number; delayed: number }>
  start: () => Worker
}

type ManagedWorker = {
  worker: Worker | null
  lastActiveAt: number
  lastScheduledAt: number
}

const GLOBAL_ACTIVE_LIMIT = Number.parseInt(process.env.WORKER_GLOBAL_ACTIVE_LIMIT ?? '4', 10)
const SWEEP_INTERVAL_MS = Number.parseInt(process.env.WORKER_SWEEP_INTERVAL_MS ?? '5000', 10)
const DEFAULT_IDLE_CLOSE_MS = Number.parseInt(process.env.WORKER_IDLE_CLOSE_MS ?? '120000', 10)

const states: Record<QueueName, ManagedWorker> = {
  campaign: { worker: null, lastActiveAt: Date.now(), lastScheduledAt: 0 },
  mail: { worker: null, lastActiveAt: Date.now(), lastScheduledAt: 0 },
  scrape: { worker: null, lastActiveAt: Date.now(), lastScheduledAt: 0 },
  warmup: { worker: null, lastActiveAt: Date.now(), lastScheduledAt: 0 },
  whatsapp: { worker: null, lastActiveAt: Date.now(), lastScheduledAt: 0 },
  whatsappSession: { worker: null, lastActiveAt: Date.now(), lastScheduledAt: 0 },
}

const queues: QueueState[] = [
  {
    queueName: 'campaign',
    priority: 100,
    idleCloseMs: DEFAULT_IDLE_CLOSE_MS,
    getCounts: async () => campaignQueue.getJobCounts('waiting', 'active', 'delayed'),
    start: startCampaignWorker,
  },
  {
    queueName: 'mail',
    priority: 90,
    idleCloseMs: DEFAULT_IDLE_CLOSE_MS,
    getCounts: async () => mailQueue.getJobCounts('waiting', 'active', 'delayed'),
    start: startMailWorker,
  },
  {
    queueName: 'whatsapp',
    priority: 80,
    idleCloseMs: DEFAULT_IDLE_CLOSE_MS,
    getCounts: async () => whatsappQueue.getJobCounts('waiting', 'active', 'delayed'),
    start: startWhatsAppWorker,
  },
  {
    queueName: 'warmup',
    priority: 60,
    idleCloseMs: DEFAULT_IDLE_CLOSE_MS,
    getCounts: async () => warmupQueue.getJobCounts('waiting', 'active', 'delayed'),
    start: startWarmupWorker,
  },
  {
    queueName: 'scrape',
    priority: 40,
    idleCloseMs: DEFAULT_IDLE_CLOSE_MS,
    getCounts: async () => scrapeQueue.getJobCounts('waiting', 'active', 'delayed'),
    start: startScrapeWorker,
  },
  {
    queueName: 'whatsappSession',
    priority: 20,
    idleCloseMs: DEFAULT_IDLE_CLOSE_MS,
    getCounts: async () => whatsappSessionQueue.getJobCounts('waiting', 'active', 'delayed'),
    start: startWhatsAppSessionWorker,
  },
]

let sweepHandle: NodeJS.Timeout | null = null
let running = false

function getManaged(queueName: QueueName): ManagedWorker {
  return states[queueName]
}

async function ensureStarted(queue: QueueState) {
  const managed = getManaged(queue.queueName)
  if (managed.worker) return managed.worker
  const worker = queue.start()
  managed.worker = worker
  managed.lastActiveAt = Date.now()
  managed.lastScheduledAt = Date.now()
  worker.on('active', () => {
    managed.lastActiveAt = Date.now()
  })
  worker.on('completed', () => {
    managed.lastActiveAt = Date.now()
  })
  worker.on('failed', () => {
    managed.lastActiveAt = Date.now()
  })
  return worker
}

async function stopWorker(queueName: QueueName) {
  const managed = getManaged(queueName)
  if (!managed.worker) return
  const worker = managed.worker
  managed.worker = null
  try {
    await worker.close()
  } catch (err) {
    console.error(`[Supervisor] Failed to close ${queueName} worker:`, err)
  }
}

async function sweep() {
  if (running) return
  running = true
  try {
    const snapshots = await Promise.all(
      queues.map(async (queue) => ({
        ...queue,
        counts: await queue.getCounts(),
      }))
    )

    const now = Date.now()
    const busyQueues = snapshots.filter((item) => item.counts.waiting + item.counts.delayed > 0 || item.counts.active > 0)

    const scoredQueues = busyQueues
      .map((item) => {
        const managed = getManaged(item.queueName)
        const ageSeconds = Math.floor((now - managed.lastScheduledAt) / 1000)
        const agingBonus = Math.min(50, Math.floor(ageSeconds / 30))
        const activePenalty = item.counts.active > 0 ? 5 : 0
        return {
          ...item,
          score: item.priority + agingBonus - activePenalty,
        }
      })
      .sort((a, b) => b.score - a.score)

    const activeBudget = Number.isFinite(GLOBAL_ACTIVE_LIMIT) && GLOBAL_ACTIVE_LIMIT > 0 ? GLOBAL_ACTIVE_LIMIT : 4
    const selectedQueues = new Set(
      scoredQueues.slice(0, activeBudget).map((item) => item.queueName)
    )

    for (const item of snapshots) {
      const managed = getManaged(item.queueName)
      const shouldRun = selectedQueues.has(item.queueName)

      if (shouldRun) {
        if (!managed.worker) {
          await ensureStarted(item)
        }
        if (managed.worker && item.counts.active > 0) {
          managed.lastActiveAt = now
        }
        continue
      }

      if (managed.worker) {
        await stopWorker(item.queueName)
      }
    }

  } catch (err) {
    console.error('[Supervisor] Sweep failed:', err)
  } finally {
    running = false
  }
}

export function startWorkerSupervisor() {
  if (sweepHandle) return
  console.log('[Supervisor] Worker supervisor started')
  void sweep()
  sweepHandle = setInterval(() => {
    void sweep()
  }, SWEEP_INTERVAL_MS)
}

export async function stopWorkerSupervisor() {
  if (sweepHandle) {
    clearInterval(sweepHandle)
    sweepHandle = null
  }

  await Promise.all([
    stopWorker('campaign'),
    stopWorker('mail'),
    stopWorker('whatsapp'),
    stopWorker('warmup'),
    stopWorker('scrape'),
    stopWorker('whatsappSession'),
  ])

  console.log('[Supervisor] Worker supervisor stopped')
}
