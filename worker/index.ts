import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load environment variables with fallback paths
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../apps/web/.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../apps/web/.env')
]

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
    break
  }
}
import { startCronScheduler, stopCronScheduler } from '~/scheduler/cronScheduler'
import { startWorkerSupervisor, stopWorkerSupervisor } from '~/runtime/workerSupervisor'

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('   OutreachOS Worker — Phase 6 Job Engine')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

// Start cron scheduler
startCronScheduler()

startWorkerSupervisor()

console.log('🚀 Worker supervisor running. Waiting for jobs...')

// ─── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`\n[Worker] Received ${signal}. Shutting down gracefully...`)
  await stopWorkerSupervisor()
  stopCronScheduler()
  console.log('[Worker] All workers closed. Goodbye.')
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
