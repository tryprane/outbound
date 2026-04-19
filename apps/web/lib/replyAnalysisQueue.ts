import { Queue } from 'bullmq'
import { getBullConnection } from '@/lib/redis'

export interface ReplyAnalysisJobData {
  mailboxMessageId: string
  reason?: 'detected' | 'opened' | 'reply-thread-view'
  force?: boolean
}

let replyAnalysisQueue: Queue<ReplyAnalysisJobData> | undefined

export function getReplyAnalysisQueue() {
  if (!replyAnalysisQueue) {
    replyAnalysisQueue = new Queue<ReplyAnalysisJobData>('reply-analysis-queue', {
      connection: getBullConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: { count: 300 },
        removeOnFail: { count: 500 },
      },
    })
  }

  return replyAnalysisQueue
}

export async function queueReplyAnalysisJobs(
  jobs: Array<ReplyAnalysisJobData | null | undefined>
) {
  const deduped = Array.from(
    new Map(
      jobs
        .filter((job): job is ReplyAnalysisJobData => Boolean(job?.mailboxMessageId))
        .map((job) => [job.mailboxMessageId, job])
    ).values()
  )

  if (deduped.length === 0) return

  const queue = getReplyAnalysisQueue()
  await Promise.all(
    deduped.map((job) =>
      queue.add('analyze-reply' as never, job as never, {
        jobId: `reply-analysis-${job.mailboxMessageId}`,
      })
    )
  )
}
