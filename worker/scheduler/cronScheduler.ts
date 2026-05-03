import { prisma } from '~/lib/prisma'
import { shouldSkipMailboxSync } from '~/processors/mailboxSyncProcessor'
import { campaignQueue } from '~/queues/campaignQueue'
import { mailboxSyncQueue } from '~/queues/mailboxSyncQueue'
import { warmupQueue } from '~/queues/warmupQueue'
import { ensureWhatsAppSessions } from '~/lib/whatsappBaileys'
import {
  evaluateMailAccountGuardrail,
  extractEmailDomain,
  providerHintFromType,
  type CampaignEligibleMailAccount,
} from '~/lib/campaignGuardrails'
import {
  DEFAULT_WARMUP_SETTINGS,
  WARMUP_SETTINGS_KEY,
  parseWarmupSettingsValue,
  recommendedLimitFromStage,
} from '~/lib/warmupSettings'

let campaignIntervalHandle: NodeJS.Timeout | null = null
let mailboxSyncIntervalHandle: NodeJS.Timeout | null = null
let warmupIntervalHandle: NodeJS.Timeout | null = null
let whatsappSessionIntervalHandle: NodeJS.Timeout | null = null
let inboxCleanupIntervalHandle: NodeJS.Timeout | null = null
let dailyResetHandle: NodeJS.Timeout | null = null

const WHATSAPP_SESSION_KEEPALIVE = String(process.env.WHATSAPP_SESSION_KEEPALIVE ?? 'false').toLowerCase() === 'true'
const MAILBOX_RETENTION_DAYS = Math.max(3, Number(process.env.MAILBOX_SYNC_RETENTION_DAYS ?? 30))
const WHATSAPP_RETENTION_DAYS = Math.max(3, Number(process.env.WHATSAPP_INBOX_RETENTION_DAYS ?? 45))

async function loadWarmupSettings() {
  const record = await prisma.systemSetting.findUnique({
    where: { key: WARMUP_SETTINGS_KEY },
  })

  return parseWarmupSettingsValue(record?.value) ?? DEFAULT_WARMUP_SETTINGS
}

function msUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now.getTime()
}

function dayWindowForSnapshot() {
  const periodEnd = new Date()
  periodEnd.setHours(0, 0, 0, 0)
  const periodStart = new Date(periodEnd)
  periodStart.setDate(periodStart.getDate() - 1)
  return { periodStart, periodEnd }
}

function summarizeMailboxHealthStatus(account: CampaignEligibleMailAccount): 'healthy' | 'warming' | 'at_risk' | 'paused' {
  if (account.mailboxHealthStatus === 'healthy') return 'healthy'
  if (account.mailboxHealthStatus === 'at_risk') return 'at_risk'
  if (account.mailboxHealthStatus === 'paused' || account.warmupStatus === 'PAUSED') return 'paused'
  return 'warming'
}

type DomainDeliveryStats = {
  total: number
  failed: number
  bounced: number
}

function computeWarmupProgression(input: {
  warmupStage: number
  recommendedDailyLimit: number
  logs: Array<{ status: string }>
  stageCounts: number[]
}) {
  const total = input.logs.length
  const sent = input.logs.filter((l) => l.status === 'sent').length
  const failed = input.logs.filter((l) => l.status === 'failed').length
  const bounced = input.logs.filter((l) => l.status === 'bounced').length
  const successRate = total > 0 ? sent / total : 0
  const failRate = total > 0 ? (failed + bounced) / total : 1
  const minRequired = Math.max(3, Math.floor(input.recommendedDailyLimit * 0.6))

  let nextStage = input.warmupStage
  if (total >= minRequired && successRate >= 0.85 && failRate <= 0.15) {
    nextStage = Math.min(input.warmupStage + 1, input.stageCounts.length - 1)
  }
  if (total >= minRequired && failRate >= 0.35) {
    nextStage = Math.max(0, input.warmupStage - 1)
  }

  const warmed = nextStage >= input.stageCounts.length - 1
  return {
    nextStage,
    warmed,
    recommendedDailyLimit: recommendedLimitFromStage(nextStage, input.stageCounts),
  }
}

async function loadRecentComplaintStatsByDomain(mailAccountIds?: string[]) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const recentComplaints = await prisma.complaintEvent.findMany({
    where: {
      createdAt: { gte: since },
      ...(mailAccountIds?.length ? { mailAccountId: { in: mailAccountIds } } : {}),
    },
    select: {
      mailAccount: {
        select: {
          email: true,
          type: true,
        },
      },
    },
  })

  const statsByDomain = new Map<string, number>()
  for (const complaint of recentComplaints) {
    const domain = extractEmailDomain(complaint.mailAccount?.email)
    if (!domain) continue
    const key = `${providerHintFromType(complaint.mailAccount?.type || 'unknown')}:${domain}`
    statsByDomain.set(key, (statsByDomain.get(key) || 0) + 1)
  }

  return statsByDomain
}

async function loadRecentDeliveryStatsByDomain(mailAccountIds?: string[]) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentMails = await prisma.sentMail.findMany({
    where: {
      sentAt: { gte: since },
      ...(mailAccountIds?.length ? { mailAccountId: { in: mailAccountIds } } : {}),
    },
    select: {
      status: true,
      mailAccount: {
        select: {
          email: true,
          type: true,
        },
      },
    },
  })

  const statsByDomain = new Map<string, DomainDeliveryStats>()
  for (const mail of recentMails) {
    const domain = extractEmailDomain(mail.mailAccount.email)
    if (!domain) continue
    const key = `${providerHintFromType(mail.mailAccount.type)}:${domain}`
    const current = statsByDomain.get(key) || { total: 0, failed: 0, bounced: 0 }
    current.total += 1
    if (mail.status === 'failed') current.failed += 1
    if (mail.status === 'bounced') current.bounced += 1
    statsByDomain.set(key, current)
  }

  return statsByDomain
}

function assessCampaignDomainRisk(
  accounts: CampaignEligibleMailAccount[],
  deliveryStatsByDomain?: Map<string, DomainDeliveryStats>,
  complaintStatsByDomain?: Map<string, number>
) {
  const eligibleAccounts = accounts.filter((account) => evaluateMailAccountGuardrail(account).eligible)
  if (eligibleAccounts.length === 0) {
    return 'No healthy eligible sender remains assigned to this campaign.'
  }

  const domainStats = new Map<string, { total: number; eligible: number; unhealthy: number }>()
  for (const account of accounts) {
    const domain = extractEmailDomain(account.email) || 'unknown'
    const current = domainStats.get(domain) || { total: 0, eligible: 0, unhealthy: 0 }
    current.total += 1
    if (evaluateMailAccountGuardrail(account).eligible) current.eligible += 1
    else current.unhealthy += 1
    domainStats.set(domain, current)
  }

  const riskyDomains = Array.from(domainStats.entries())
    .filter(([, stats]) => stats.total >= 2 && stats.unhealthy >= 2 && stats.unhealthy / stats.total >= 0.6)
    .map(([domain, stats]) => `${domain} (${stats.unhealthy}/${stats.total} unhealthy)`)

  if (riskyDomains.length > 0) {
    return `Domain guardrail triggered for ${riskyDomains.join(', ')}.`
  }

  if (deliveryStatsByDomain) {
    const deliveryRisk = Array.from(
      new Set(
        accounts.map((account) => {
          const domain = extractEmailDomain(account.email)
          if (!domain) return null
          const key = `${providerHintFromType(account.type)}:${domain}`
          const stats = deliveryStatsByDomain.get(key)
          if (!stats || stats.total < 8) return null
          const bounceRate = stats.bounced / Math.max(1, stats.total)
          const failRate = (stats.failed + stats.bounced) / Math.max(1, stats.total)
          if (bounceRate >= 0.12 || failRate >= 0.2) {
            return `${domain} (${Math.round(bounceRate * 100)}% bounce, ${Math.round(failRate * 100)}% failure)`
          }
          return null
        }).filter((value): value is string => Boolean(value))
      )
    )

    if (deliveryRisk.length > 0) {
      return `Recent delivery reputation is weak for ${deliveryRisk.join(', ')}.`
    }
  }

  if (complaintStatsByDomain) {
    const complaintRisk = Array.from(
      new Set(
        accounts.map((account) => {
          const domain = extractEmailDomain(account.email)
          if (!domain) return null
          const key = `${providerHintFromType(account.type)}:${domain}`
          const count = complaintStatsByDomain.get(key) || 0
          if (count > 0) {
            return `${domain} (${count} complaints in 14d)`
          }
          return null
        }).filter((value): value is string => Boolean(value))
      )
    )
    if (complaintRisk.length > 0) {
      return `Recent recipient complaints detected for ${complaintRisk.join(', ')}.`
    }
  }

  return null
}

async function captureDomainHealthSnapshots() {
  const [accounts, activeAssignments, deliveryStatsByDomain, complaintStatsByDomain] = await Promise.all([
    prisma.mailAccount.findMany({
      select: {
        id: true,
        email: true,
        type: true,
        isActive: true,
        warmupStatus: true,
        mailboxHealthStatus: true,
        mailboxHealthScore: true,
        mailboxSyncStatus: true,
      },
    }),
    prisma.campaignMailAccount.findMany({
      where: {
        campaign: {
          channel: 'EMAIL',
          status: 'active',
        },
      },
      select: {
        campaignId: true,
        mailAccount: {
          select: {
            email: true,
            type: true,
          },
        },
      },
    }),
    loadRecentDeliveryStatsByDomain(),
    loadRecentComplaintStatsByDomain(),
  ])

  const activeCampaignsByDomain = new Map<string, Set<string>>()
  for (const assignment of activeAssignments) {
    const domain = extractEmailDomain(assignment.mailAccount.email)
    if (!domain) continue
    const key = `${providerHintFromType(assignment.mailAccount.type)}:${domain}`
    const current = activeCampaignsByDomain.get(key) || new Set<string>()
    current.add(assignment.campaignId)
    activeCampaignsByDomain.set(key, current)
  }

  const grouped = new Map<string, {
    domain: string
    providerHint: string
    mailboxCount: number
    healthyCount: number
    warmingCount: number
    atRiskCount: number
    pausedCount: number
    healthScoreTotal: number
  }>()

  for (const account of accounts) {
    const domain = extractEmailDomain(account.email)
    if (!domain) continue
    const providerHint = providerHintFromType(account.type)
    const key = `${providerHint}:${domain}`
    const current = grouped.get(key) || {
      domain,
      providerHint,
      mailboxCount: 0,
      healthyCount: 0,
      warmingCount: 0,
      atRiskCount: 0,
      pausedCount: 0,
      healthScoreTotal: 0,
    }
    current.mailboxCount += 1
    current.healthScoreTotal += account.mailboxHealthScore
    const status = summarizeMailboxHealthStatus(account)
    if (status === 'healthy') current.healthyCount += 1
    if (status === 'warming') current.warmingCount += 1
    if (status === 'at_risk') current.atRiskCount += 1
    if (status === 'paused') current.pausedCount += 1
    grouped.set(key, current)
  }

  const { periodStart, periodEnd } = dayWindowForSnapshot()
  const snapshotData = Array.from(grouped.values()).map((entry) => {
    const activeCampaignCount = activeCampaignsByDomain.get(`${entry.providerHint}:${entry.domain}`)?.size || 0
    const averageHealthScore =
      entry.mailboxCount > 0 ? Math.round(entry.healthScoreTotal / entry.mailboxCount) : 0
    const deliveryStats = deliveryStatsByDomain.get(`${entry.providerHint}:${entry.domain}`)
    const sentCount7d = deliveryStats?.total || 0
    const failedCount7d = deliveryStats?.failed || 0
    const bouncedCount7d = deliveryStats?.bounced || 0
    const bounceRate7d = sentCount7d > 0
      ? Number((bouncedCount7d / sentCount7d).toFixed(3))
      : 0
    const failureRate7d = sentCount7d > 0
      ? Number(((failedCount7d + bouncedCount7d) / sentCount7d).toFixed(3))
      : 0
    const complaintCount14d = complaintStatsByDomain.get(`${entry.providerHint}:${entry.domain}`) || 0
    const notes = [
      `${entry.healthyCount} healthy`,
      `${entry.atRiskCount} at risk`,
      `${entry.pausedCount} paused`,
      `${activeCampaignCount} active campaigns`,
      `${Math.round(bounceRate7d * 100)}% bounce`,
      `${Math.round(failureRate7d * 100)}% failure`,
      `${complaintCount14d} complaints`,
    ].join(' | ')

    return {
      domain: entry.domain,
      providerHint: entry.providerHint,
      periodStart,
      periodEnd,
      mailboxCount: entry.mailboxCount,
      healthyCount: entry.healthyCount,
      warmingCount: entry.warmingCount,
      atRiskCount: entry.atRiskCount,
      pausedCount: entry.pausedCount,
      averageHealthScore,
      activeCampaignCount,
      sentCount7d,
      failedCount7d,
      bouncedCount7d,
      bounceRate7d,
      failureRate7d,
      complaintCount14d,
      notes,
    }
  })

  await prisma.domainHealthSnapshot.deleteMany({
    where: { periodStart, periodEnd },
  })

  if (snapshotData.length > 0) {
    await prisma.domainHealthSnapshot.createMany({ data: snapshotData })
    console.log(`[Cron] Domain health snapshots captured for ${snapshotData.length} domain(s)`)
  }
}

async function runDailyReset() {
  try {
    const warmupSettings = await loadWarmupSettings()
    const [mailResetResult, waResetResult] = await Promise.all([
      prisma.mailAccount.updateMany({
        data: { sentToday: 0, warmupSentToday: 0, lastResetAt: new Date() },
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

      const progression = computeWarmupProgression({
        warmupStage: acc.warmupStage,
        recommendedDailyLimit: acc.recommendedDailyLimit,
        logs: warmupLogs,
        stageCounts: warmupSettings.stageCounts,
      })

      await prisma.mailAccount.update({
        where: { id: acc.id },
        data: {
          warmupStage: progression.nextStage,
          recommendedDailyLimit: progression.recommendedDailyLimit,
          warmupStatus: progression.warmed ? 'WARMED' : 'WARMING',
          warmupCompletedAt: progression.warmed ? new Date() : null,
        },
      })
    }

    if (warmingAccounts.length > 0) {
      console.log(`[Cron] Warmup progression updated for ${warmingAccounts.length} mailbox(es)`)
    }

    await captureDomainHealthSnapshots()
  } catch (err) {
    console.error('[Cron] Daily reset failed:', err)
  }

  dailyResetHandle = setTimeout(async () => {
    await runDailyReset()
  }, msUntilMidnight())
}

async function pollActiveCampaigns() {
  try {
    const campaignsToReview = await prisma.campaign.findMany({
      where: {
        OR: [
          { status: 'active' },
          {
            status: 'paused',
            guardrailReason: { not: null },
          },
        ],
      },
      select: {
        id: true,
        channel: true,
        status: true,
        guardrailReason: true,
        mailAccounts: {
          select: {
            mailAccount: {
              select: {
                id: true,
                email: true,
                type: true,
                isActive: true,
                warmupStatus: true,
                mailboxHealthStatus: true,
                mailboxHealthScore: true,
                mailboxSyncStatus: true,
              },
            },
          },
        },
      },
    })

    if (campaignsToReview.length === 0) return

    for (const campaign of campaignsToReview) {
      if (campaign.channel === 'EMAIL') {
        const deliveryStatsByDomain = await loadRecentDeliveryStatsByDomain(
          campaign.mailAccounts.map((assignment) => assignment.mailAccount.id)
        )
        const complaintStatsByDomain = await loadRecentComplaintStatsByDomain(
          campaign.mailAccounts.map((assignment) => assignment.mailAccount.id)
        )
        const guardrailReason = assessCampaignDomainRisk(
          campaign.mailAccounts.map((assignment) => assignment.mailAccount),
          deliveryStatsByDomain,
          complaintStatsByDomain
        )
        if (guardrailReason) {
          if (campaign.status === 'active' || campaign.guardrailReason !== guardrailReason) {
            await prisma.campaign.update({
              where: { id: campaign.id },
              data: {
                status: 'paused',
                guardrailReason,
              },
            })
          }
          if (campaign.status === 'active') {
            console.warn(`[Cron] Campaign ${campaign.id} auto-paused: ${guardrailReason}`)
          }
          continue
        }

        if (campaign.guardrailReason) {
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { guardrailReason: null },
          })
        }
      }

      if (campaign.status !== 'active') continue

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
    const settings = await loadWarmupSettings()
    if (!settings.globalEnabled) {
      return
    }

    const warmingAccounts = await prisma.mailAccount.findMany({
      where: {
        warmupStatus: { in: ['WARMING', 'WARMED'] },
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

async function pollMailboxSyncAccounts() {
  try {
    const accounts = await prisma.mailAccount.findMany({
      where: {
        OR: [
          { type: 'gmail', refreshToken: { not: null } },
          { type: 'zoho', zohoRefreshToken: { not: null } },
        ],
      },
      select: { id: true, type: true, mailboxSyncError: true, mailboxLastSyncedAt: true },
    })

    for (const account of accounts) {
      if (shouldSkipMailboxSync(account)) continue
      const slot = Math.floor(Date.now() / (5 * 60_000))
      await mailboxSyncQueue.add(
        'sync-mailbox' as never,
        { mailAccountId: account.id, reason: 'scheduled' } as never,
        { jobId: `mailbox-sync-${account.id}-${slot}` }
      )
    }
  } catch (err) {
    console.error('[Cron] Mailbox sync poll failed:', err)
  }
}

async function pruneUnifiedInboxData() {
  try {
    const mailboxCutoff = new Date(Date.now() - MAILBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const whatsappCutoff = new Date(Date.now() - WHATSAPP_RETENTION_DAYS * 24 * 60 * 60 * 1000)

    const [deletedMailboxMessages, deletedWhatsAppMessages] = await prisma.$transaction([
      prisma.mailboxMessage.deleteMany({
        where: {
          createdAt: { lt: mailboxCutoff },
        },
      }),
      prisma.whatsAppConversationMessage.deleteMany({
        where: {
          createdAt: { lt: whatsappCutoff },
        },
      }),
    ])

    const [deletedThreads, deletedConversations] = await prisma.$transaction([
      prisma.mailboxThread.deleteMany({
        where: {
          messages: {
            none: {},
          },
        },
      }),
      prisma.whatsAppConversation.deleteMany({
        where: {
          messages: {
            none: {},
          },
        },
      }),
    ])

    if (
      deletedMailboxMessages.count > 0 ||
      deletedWhatsAppMessages.count > 0 ||
      deletedThreads.count > 0 ||
      deletedConversations.count > 0
    ) {
      console.log(
        `[Cron] Inbox cleanup pruned ${deletedMailboxMessages.count} email messages, ${deletedThreads.count} email threads, ${deletedWhatsAppMessages.count} WhatsApp messages, ${deletedConversations.count} WhatsApp conversations`
      )
    }
  } catch (err) {
    console.error('[Cron] Inbox cleanup failed:', err)
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
  void pollMailboxSyncAccounts()
  void pollWarmupAccounts()
  void pruneUnifiedInboxData()
  if (WHATSAPP_SESSION_KEEPALIVE) {
    void pollWhatsAppSessions()
  }

  campaignIntervalHandle = setInterval(pollActiveCampaigns, 60_000)
  mailboxSyncIntervalHandle = setInterval(pollMailboxSyncAccounts, 300_000)
  warmupIntervalHandle = setInterval(pollWarmupAccounts, 60_000)
  inboxCleanupIntervalHandle = setInterval(pruneUnifiedInboxData, 6 * 60 * 60 * 1000)
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
  if (mailboxSyncIntervalHandle) {
    clearInterval(mailboxSyncIntervalHandle)
    mailboxSyncIntervalHandle = null
  }
  if (whatsappSessionIntervalHandle) {
    clearInterval(whatsappSessionIntervalHandle)
    whatsappSessionIntervalHandle = null
  }
  if (inboxCleanupIntervalHandle) {
    clearInterval(inboxCleanupIntervalHandle)
    inboxCleanupIntervalHandle = null
  }
  if (dailyResetHandle) {
    clearTimeout(dailyResetHandle)
    dailyResetHandle = null
  }
  console.log('[Cron] Scheduler stopped')
}
