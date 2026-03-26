type WorkerLimitName =
  | 'campaign'
  | 'mail'
  | 'scrape'
  | 'whatsapp'
  | 'warmup'
  | 'whatsappSession'

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getWorkerConcurrency(name: WorkerLimitName): number {
  switch (name) {
    case 'campaign':
      return readPositiveInt(process.env.CAMPAIGN_WORKER_CONCURRENCY, 1)
    case 'mail':
      return readPositiveInt(process.env.MAIL_WORKER_CONCURRENCY, 1)
    case 'scrape':
      return readPositiveInt(process.env.SCRAPE_WORKER_CONCURRENCY, 1)
    case 'whatsapp':
      return readPositiveInt(process.env.WHATSAPP_WORKER_CONCURRENCY, 1)
    case 'warmup':
      return readPositiveInt(process.env.WARMUP_WORKER_CONCURRENCY, 1)
    case 'whatsappSession':
      return readPositiveInt(process.env.WHATSAPP_SESSION_WORKER_CONCURRENCY, 1)
  }
}
