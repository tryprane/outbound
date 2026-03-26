import { prisma } from '~/lib/prisma'
import { campaignQueue } from '~/queues/campaignQueue'
import { warmupQueue } from '~/queues/warmupQueue'
import { ensureWhatsAppSessions } from '~/lib/whatsappBaileys'

let campaignIntervalHandle: NodeJS.Timeout | null = null
let warmupIntervalHandle: NodeJS.Timeout | null = null
let whatsappSessionIntervalHandle: NodeJS.Timeout | null = null
let dailyResetHandle: NodeJS.Timeout | null = null

const WHATSAPP_SESSION_KEEPALIVE = String(process.env.WHATSAPP_SESSION_KEEPALIVE ?? 'false').toLowerCase() === 'true'

const WARMUP_LIMIT_PLAN = [5, 10, 20, 35, 50, 75]

function recommendedLimitFromStage(stage: number): number {
  const idx = Math.max(0, Math.min(stage, WARMUP_LIMIT_PLAN.length - 1))
  return WARMUP_LIMIT_PLAN[idx]
}

function msUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now.getTime()
}

async function runDailyReset() {
  try {
    const [mailResetResult, waResetResult] = await Promise.all([
      prisma.mailAccount.updateMany({
        data: { sentToday: 0, lastResetAt: new Date() },
      }),
      prisma.whatsAppAccount.updateMany({
        data: { sentToday: 0, lastResetAt: new Date() },
      }),
    ])

    console.log(
      `[Cron] Daily reset complete: ${mailResetResult.count} mail accounts, ${waResetResult.count} WhatsApp accounts`
    )

    const warmingAccounts = await prisma.mailAccount.findMany({
      where: { warmupStatus: 'WARMING' },
      select: { id: true, warmupStage: true, recommendedDailyLimit: true },
    })

    for (const acc of warmingAccounts) {
      const warmupLogs = await prisma.warmupMailLog.findMany({
        where: {
          senderMailAccountId: acc.id,
          sentAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        select: { status: true },
      })

      const total = warmupLogs.length
      const sent = warmupLogs.filter((l) => l.status === 'sent').length
      const failed = warmupLogs.filter((l) => l.status === 'failed').length
      const bounced = warmupLogs.filter((l) => l.status === 'bounced').length
      const successRate = total > 0 ? sent / total : 0
      const failRate = total > 0 ? (failed + bounced) / total : 1
      const minRequired = Math.max(3, Math.floor(acc.recommendedDailyLimit * 0.6))

      let nextStage = acc.warmupStage
      if (total >= minRequired && successRate >= 0.85 && failRate <= 0.15) {
        nextStage = Math.min(acc.warmupStage + 1, WARMUP_LIMIT_PLAN.length - 1)
      }
      if (total >= minRequired && failRate >= 0.35) {
        nextStage = Math.max(0, acc.warmupStage - 1)
      }

      const warmed = nextStage >= WARMUP_LIMIT_PLAN.length - 1

      await prisma.mailAccount.update({
        where: { id: acc.id },
        data: {
          warmupStage: nextStage,
          recommendedDailyLimit: recommendedLimitFromStage(nextStage),
          warmupStatus: warmed ? 'WARMED' : 'WARMING',
          warmupCompletedAt: warmed ? new Date() : null,
        },
      })
    }

    if (warmingAccounts.length > 0) {
      console.log(`[Cron] Warmup progression updated for ${warmingAccounts.length} mailbox(es)`)
    }
  } catch (err) {
    console.error('[Cron] Daily reset failed:', err)
  }

  dailyResetHandle = setTimeout(async () => {
    await runDailyReset()
  }, msUntilMidnight())
}

async function pollActiveCampaigns() {
  try {
    const activeCampaigns = await prisma.campaign.findMany({
      where: { status: 'active' },
      select: { id: true },
    })

    if (activeCampaigns.length === 0) return

    for (const campaign of activeCampaigns) {
      await campaignQueue.add(
        'process-campaign' as never,
        { campaignId: campaign.id } as never,
        { jobId: `campaign-tick-${campaign.id}` }
      )
    }
  } catch (err) {
    console.error('[Cron] Campaign poll failed:', err)
  }
}

async function pollWarmupAccounts() {
  try {
    const warmingAccounts = await prisma.mailAccount.findMany({
      where: {
        warmupStatus: 'WARMING',
        warmupAutoEnabled: true,
      },
      select: { id: true },
    })

    for (const acc of warmingAccounts) {
      const slot = Math.floor(Date.now() / 60_000)
      await warmupQueue.add(
        'process-warmup' as never,
        { mailAccountId: acc.id } as never,
        { jobId: `warmup-tick-${acc.id}-${slot}` }
      )
    }
  } catch (err) {
    console.error('[Cron] Warmup poll failed:', err)
  }
}

async function pollWhatsAppSessions() {
  try {
    await ensureWhatsAppSessions()
  } catch (err) {
    console.error('[Cron] WhatsApp session poll failed:', err)
  }
}

export function startCronScheduler() {
  console.log('[Cron] Scheduler started')

  void pollActiveCampaigns()
  void pollWarmupAccounts()
  if (WHATSAPP_SESSION_KEEPALIVE) {
    void pollWhatsAppSessions()
  }

  campaignIntervalHandle = setInterval(pollActiveCampaigns, 60_000)
  warmupIntervalHandle = setInterval(pollWarmupAccounts, 60_000)
  if (WHATSAPP_SESSION_KEEPALIVE) {
    whatsappSessionIntervalHandle = setInterval(pollWhatsAppSessions, 300_000)
  }

  dailyResetHandle = setTimeout(async () => {
    await runDailyReset()
  }, msUntilMidnight())
}

export function stopCronScheduler() {
  if (campaignIntervalHandle) {
    clearInterval(campaignIntervalHandle)
    campaignIntervalHandle = null
  }
  if (warmupIntervalHandle) {
    clearInterval(warmupIntervalHandle)
    warmupIntervalHandle = null
  }
  if (whatsappSessionIntervalHandle) {
    clearInterval(whatsappSessionIntervalHandle)
    whatsappSessionIntervalHandle = null
  }
  if (dailyResetHandle) {
    clearTimeout(dailyResetHandle)
    dailyResetHandle = null
  }
  console.log('[Cron] Scheduler stopped')
}
