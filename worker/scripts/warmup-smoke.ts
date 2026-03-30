import { PrismaClient } from '@prisma/client'
import { Queue } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'
import IORedis from 'ioredis'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../../.env') })

const prisma = new PrismaClient()
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/0'
const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null })
const warmupQueue = new Queue('warmup-queue', {
  connection: redis as unknown as ConnectionOptions,
})

const POLL_INTERVAL_MS = 5_000
const timeoutMs = Number.parseInt(process.env.WARMUP_SMOKE_TIMEOUT_MS || '120000', 10)
const clearCooldown = String(process.env.WARMUP_SMOKE_CLEAR_COOLDOWN || 'true').toLowerCase() === 'true'
const requestedAccountEmail = process.env.WARMUP_SMOKE_ACCOUNT_EMAIL?.trim().toLowerCase()

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForWarmupLog(mailAccountId: string, startedAt: Date) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const log = await prisma.warmupMailLog.findFirst({
      where: {
        senderMailAccountId: mailAccountId,
        sentAt: { gte: startedAt },
      },
      orderBy: { sentAt: 'desc' },
    })

    if (log) return log
    await sleep(POLL_INTERVAL_MS)
  }

  return null
}

async function describeJobState(jobId: string) {
  const job = await warmupQueue.getJob(jobId)
  if (!job) return 'missing'
  return job.getState()
}

async function waitForReplyLog(senderMailAccountId: string, recipientMailAccountId: string, startedAt: Date) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const log = await prisma.warmupMailLog.findFirst({
      where: {
        senderMailAccountId,
        recipientMailAccountId,
        direction: 'reply',
        sentAt: { gte: startedAt },
      },
      orderBy: { sentAt: 'desc' },
    })

    if (log) return log
    await sleep(POLL_INTERVAL_MS)
  }

  return null
}

async function main() {
  console.log('--- Warmup Staging Smoke Test ---')
  console.log(`Database URL present: ${Boolean(process.env.DATABASE_URL)}`)
  console.log(`Redis URL: ${redisUrl}`)

  await redis.ping()
  await prisma.$queryRaw`SELECT 1`
  console.log('OK Infra check passed: Redis + Postgres reachable')

  const account = await prisma.mailAccount.findFirst({
    where: {
      warmupStatus: 'WARMING',
      warmupAutoEnabled: true,
      ...(requestedAccountEmail ? { email: requestedAccountEmail } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (!account) {
    throw new Error(
      requestedAccountEmail
        ? `No WARMING warmup mailbox found for ${requestedAccountEmail}`
        : 'No mailbox found with warmupStatus=WARMING and warmupAutoEnabled=true'
    )
  }

  const [activeRecipientCount, activeSiblingCount] = await Promise.all([
    prisma.warmupRecipient.count({
      where: { isActive: true, email: { not: account.email } },
    }),
    prisma.mailAccount.count({
      where: {
        id: { not: account.id },
        warmupStatus: { in: ['WARMING', 'WARMED'] },
        warmupAutoEnabled: true,
        email: { not: account.email },
      },
    }),
  ])

  if (activeRecipientCount === 0 && activeSiblingCount === 0) {
    throw new Error('No active warmup recipients or eligible sibling mailboxes are available')
  }

  console.log(`Using mailbox: ${account.email} (${account.id})`)
  console.log(`Available external recipients: ${activeRecipientCount}`)
  console.log(`Available sibling warmup mailboxes: ${activeSiblingCount}`)

  if (clearCooldown) {
    await prisma.mailAccount.update({
      where: { id: account.id },
      data: { lastMailSentAt: null },
    })
    console.log('Cleared lastMailSentAt so the smoke test is not blocked by cooldown')
  }

  const baseline = await prisma.mailAccount.findUnique({
    where: { id: account.id },
    select: {
      sentToday: true,
      recommendedDailyLimit: true,
      warmupStage: true,
      warmupStatus: true,
    },
  })

  if (!baseline) {
    throw new Error(`Mailbox ${account.id} disappeared before the smoke test started`)
  }

  console.log(
    `Baseline: sentToday=${baseline.sentToday}, recommendedDailyLimit=${baseline.recommendedDailyLimit}, stage=${baseline.warmupStage}, status=${baseline.warmupStatus}`
  )

  if (baseline.sentToday >= baseline.recommendedDailyLimit) {
    throw new Error(
      `Mailbox already hit the daily limit (${baseline.sentToday}/${baseline.recommendedDailyLimit}); reset or use another mailbox`
    )
  }

  const startedAt = new Date()
  const job = await warmupQueue.add(
    'process-warmup',
    { mailAccountId: account.id },
    { jobId: `warmup-smoke-${account.id}-${startedAt.getTime()}` }
  )

  console.log(`Enqueued warmup job ${job.id}`)
  console.log(`Polling for warmup log evidence for up to ${Math.round(timeoutMs / 1000)}s...`)

  const log = await waitForWarmupLog(account.id, startedAt)
  if (!log) {
    const state = await describeJobState(String(job.id))
    if (state === 'waiting' || state === 'delayed') {
      throw new Error(
        `Warmup job was enqueued but is still ${state}. The queue is reachable, but no worker appears to be consuming warmup jobs. Start the worker process and retry.`
      )
    }
    if (state === 'active') {
      throw new Error(
        'Warmup job is active but no warmup log appeared before timeout. Check worker logs for a stuck processor or outbound provider timeout.'
      )
    }
    if (state === 'failed') {
      const failedJob = await warmupQueue.getJob(String(job.id))
      throw new Error(
        `Warmup job failed before a log was recorded. Worker error: ${failedJob?.failedReason || 'unknown error'}`
      )
    }
    throw new Error(`Warmup job finished in state "${state}" but no new warmup log appeared before timeout`)
  }

  const updatedAccount = await prisma.mailAccount.findUnique({
    where: { id: account.id },
    select: {
      sentToday: true,
      lastMailSentAt: true,
      warmupStatus: true,
      warmupAutoEnabled: true,
    },
  })

  console.log(`Warmup log status: ${log.status}`)
  console.log(`Recipient: ${log.recipientEmail} (${log.recipientType})`)
  console.log(`Direction: ${log.direction}`)
  console.log(`Sent at: ${log.sentAt.toISOString()}`)
  if (log.errorMessage) console.log(`Error: ${log.errorMessage}`)

  if (updatedAccount) {
    console.log(
      `Mailbox after run: sentToday=${updatedAccount.sentToday}, warmupStatus=${updatedAccount.warmupStatus}, auto=${updatedAccount.warmupAutoEnabled}`
    )
  }

  if (log.status === 'sent' && log.recipientType === 'system' && log.recipientMailAccountId) {
    console.log('Checking whether an automatic system reply was generated...')
    const reply = await waitForReplyLog(log.recipientMailAccountId, account.id, startedAt)
    if (reply) {
      console.log(`Reply log detected from ${reply.senderMailAccountId} at ${reply.sentAt.toISOString()}`)
    } else {
      console.log('No reply log detected during the smoke-test window. That can still be valid because replies are probabilistic.')
    }
  }

  console.log('Smoke test completed successfully')
}

main()
  .catch((error) => {
    console.error('Smoke test failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await warmupQueue.close()
    await redis.quit()
    await prisma.$disconnect()
  })
