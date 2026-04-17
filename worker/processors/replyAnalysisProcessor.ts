import { Worker, type Job } from 'bullmq'
import { Prisma } from '@prisma/client'
import { prisma } from '~/lib/prisma'
import { analyzeReply } from '~/lib/replyAnalysis'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import type { ReplyAnalysisJobData } from '~/queues/replyAnalysisQueue'

async function processReplyAnalysisJob(job: Job<ReplyAnalysisJobData>) {
  const message = await prisma.mailboxMessage.findUnique({
    where: { id: job.data.mailboxMessageId },
    select: {
      id: true,
      direction: true,
      isWarmup: true,
      openedAt: true,
      subject: true,
      snippet: true,
      fromEmail: true,
      toEmail: true,
      analysisStatus: true,
    },
  })

  if (!message) return
  if (message.direction !== 'inbound' || message.isWarmup || !message.openedAt) return
  if (!job.data.force && message.analysisStatus === 'complete') return

  await prisma.mailboxMessage.update({
    where: { id: message.id },
    data: {
      analysisStatus: 'pending',
      analysisRequestedAt: new Date(),
      analysisError: null,
    },
  })

  try {
    const analysis = await analyzeReply({
      subject: message.subject,
      snippet: message.snippet,
      fromEmail: message.fromEmail,
      toEmail: message.toEmail,
    })

    await prisma.mailboxMessage.update({
      where: { id: message.id },
      data: {
        analysisStatus: 'complete',
        analyzedAt: new Date(),
        analysisModel: analysis.model,
        analysisLabel: analysis.label,
        analysisShouldReply: analysis.shouldReply,
        analysisPriority: analysis.priority,
        analysisSummary: analysis.summary,
        analysisReason: analysis.reason,
        analysisError: null,
        analysisRaw: analysis.raw as Prisma.InputJsonValue,
      },
    })
  } catch (error) {
    await prisma.mailboxMessage.update({
      where: { id: message.id },
      data: {
        analysisStatus: 'error',
        analysisError: error instanceof Error ? error.message : String(error),
      },
    })
    throw error
  }
}

export function startReplyAnalysisWorker() {
  const worker = new Worker<ReplyAnalysisJobData>('reply-analysis-queue', processReplyAnalysisJob, {
    connection: getRedisConnection(),
    concurrency: getWorkerConcurrency('replyAnalysis'),
  })

  worker.on('completed', (job) => {
    console.log(`[ReplyAnalysis] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err: Error) => {
    console.error(`[ReplyAnalysis] Job ${job?.id} failed: ${err.message}`)
  })

  console.log('[Worker] Reply analysis worker started')
  return worker
}
