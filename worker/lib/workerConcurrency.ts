type WorkerLimitName =
  | 'apiDispatch'
  | 'campaign'
  | 'mail'
  | 'replyAnalysis'
  | 'mailboxInteraction'
  | 'mailboxSync'
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
    case 'apiDispatch':
      return readPositiveInt(process.env.API_DISPATCH_WORKER_CONCURRENCY, 1)
    case 'campaign':
      return readPositiveInt(process.env.CAMPAIGN_WORKER_CONCURRENCY, 1)
    case 'mail':
      return readPositiveInt(process.env.MAIL_WORKER_CONCURRENCY, 1)
    case 'replyAnalysis':
      return readPositiveInt(process.env.REPLY_ANALYSIS_WORKER_CONCURRENCY, 1)
    case 'mailboxInteraction':
      return readPositiveInt(process.env.MAILBOX_INTERACTION_WORKER_CONCURRENCY, 1)
    case 'mailboxSync':
      return readPositiveInt(process.env.MAILBOX_SYNC_WORKER_CONCURRENCY, 1)
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
