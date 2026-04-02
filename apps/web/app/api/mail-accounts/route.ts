import { NextRequest, NextResponse } from 'next/server'
import { getDomainDiagnostics, getDomainDiagnosticsBlockers, type DomainProviderHint } from '@/lib/domainDiagnostics'
import { prisma } from '@/lib/prisma'
import { getMailboxSyncQueue } from '@/lib/mailboxSyncQueue'
import { getWhatsAppSessionQueue } from '@/lib/whatsappSessionQueue'
import { getWarmupQueue } from '@/lib/warmupQueue'
import { extractEmailDomain, providerHintFromType } from '@/lib/campaignGuardrails'
import { markMailboxMessageAsRead, rescueMailboxMessageToInbox, replyToMailboxMessage } from '@/lib/mailboxActions'

const WARMUP_LIMIT_PLAN = [5, 10, 20, 35, 50, 75]
type WarmupStatus = 'COLD' | 'WARMING' | 'WARMED' | 'PAUSED'
const ZOHO_IMAP_DISABLED_MESSAGE = 'Zoho IMAP is turned off for this mailbox'
const ZOHO_API_RECONNECT_MESSAGE = 'Reconnect Zoho account to restore mailbox API access'

function recommendedLimitFromStage(stage: number): number {
  const idx = Math.max(0, Math.min(stage, WARMUP_LIMIT_PLAN.length - 1))
  return WARMUP_LIMIT_PLAN[idx]
}

type DomainHealthSummary = {
  domain: string
  providerHint: DomainProviderHint
  mailboxCount: number
  healthyCount: number
  warmingCount: number
  atRiskCount: number
  pausedCount: number
  averageHealthScore: number
  activeCampaignCount: number
  sentCount7d: number
  failedCount7d: number
  bouncedCount7d: number
  bounceRate7d: number
  failureRate7d: number
  complaintCount14d: number
  healthStatus: 'healthy' | 'warming' | 'at_risk' | 'paused'
  notes: string
}

function summarizeDomainMailboxStatus(account: {
  mailboxHealthStatus: string
  warmupStatus: WarmupStatus
}): 'healthy' | 'warming' | 'at_risk' | 'paused' {
  if (account.mailboxHealthStatus === 'healthy') return 'healthy'
  if (account.mailboxHealthStatus === 'at_risk') return 'at_risk'
  if (account.mailboxHealthStatus === 'paused' || account.warmupStatus === 'PAUSED') return 'paused'
  return 'warming'
}

async function buildDomainHealthSummary(): Promise<DomainHealthSummary[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const complaintSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const [accounts, activeAssignments, recentSentMail, complaintEvents] = await Promise.all([
    prisma.mailAccount.findMany({
      select: {
        email: true,
        type: true,
        warmupStatus: true,
        mailboxHealthStatus: true,
        mailboxHealthScore: true,
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
    prisma.sentMail.findMany({
      where: {
        sentAt: { gte: since },
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
    }),
    prisma.complaintEvent.findMany({
      where: {
        createdAt: { gte: complaintSince },
      },
      select: {
        mailAccount: {
          select: {
            email: true,
            type: true,
          },
        },
      },
    }),
  ])

  const activeCampaignsByDomain = new Map<string, Set<string>>()
  for (const assignment of activeAssignments) {
    const domain = extractEmailDomain(assignment.mailAccount.email)
    if (!domain) continue
    const providerHint = providerHintFromType(assignment.mailAccount.type)
    const key = `${providerHint}:${domain}`
    const current = activeCampaignsByDomain.get(key) || new Set<string>()
    current.add(assignment.campaignId)
    activeCampaignsByDomain.set(key, current)
  }

  const grouped = new Map<string, DomainHealthSummary & { healthScoreTotal: number }>()
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
      averageHealthScore: 0,
      activeCampaignCount: 0,
      sentCount7d: 0,
      failedCount7d: 0,
      bouncedCount7d: 0,
      bounceRate7d: 0,
      failureRate7d: 0,
      complaintCount14d: 0,
      healthStatus: 'warming' as const,
      notes: '',
      healthScoreTotal: 0,
    }
    current.mailboxCount += 1
    current.healthScoreTotal += account.mailboxHealthScore
    const status = summarizeDomainMailboxStatus(account)
    if (status === 'healthy') current.healthyCount += 1
    if (status === 'warming') current.warmingCount += 1
    if (status === 'at_risk') current.atRiskCount += 1
    if (status === 'paused') current.pausedCount += 1
    grouped.set(key, current)
  }

  for (const log of recentSentMail) {
    const domain = extractEmailDomain(log.mailAccount.email)
    if (!domain) continue
    const providerHint = providerHintFromType(log.mailAccount.type)
    const key = `${providerHint}:${domain}`
    const current = grouped.get(key)
    if (!current) continue
    current.sentCount7d += 1
    if (log.status === 'failed') current.failedCount7d += 1
    if (log.status === 'bounced') current.bouncedCount7d += 1
  }

  for (const complaint of complaintEvents) {
    const domain = extractEmailDomain(complaint.mailAccount?.email)
    if (!domain) continue
    const providerHint = providerHintFromType(complaint.mailAccount?.type || 'unknown')
    const key = `${providerHint}:${domain}`
    const current = grouped.get(key)
    if (!current) continue
    current.complaintCount14d += 1
  }

  return Array.from(grouped.values())
    .map((entry) => {
      const activeCampaignCount = activeCampaignsByDomain.get(`${entry.providerHint}:${entry.domain}`)?.size || 0
      const averageHealthScore =
        entry.mailboxCount > 0 ? Math.round(entry.healthScoreTotal / entry.mailboxCount) : 0
      const bounceRate7d =
        entry.sentCount7d > 0 ? Number((entry.bouncedCount7d / entry.sentCount7d).toFixed(3)) : 0
      const failureRate7d =
        entry.sentCount7d > 0 ? Number(((entry.failedCount7d + entry.bouncedCount7d) / entry.sentCount7d).toFixed(3)) : 0
      let healthStatus: DomainHealthSummary['healthStatus'] = 'warming'
      if (entry.pausedCount === entry.mailboxCount && entry.mailboxCount > 0) healthStatus = 'paused'
      else if (
        (entry.atRiskCount > 0 && entry.healthyCount === 0) ||
        bounceRate7d >= 0.12 ||
        failureRate7d >= 0.2 ||
        entry.complaintCount14d > 0
      ) healthStatus = 'at_risk'
      else if (entry.healthyCount > 0 && entry.atRiskCount === 0 && entry.pausedCount === 0) healthStatus = 'healthy'
      const notes = [
        `${entry.healthyCount} healthy`,
        `${entry.atRiskCount} at risk`,
        `${entry.pausedCount} paused`,
        `${activeCampaignCount} active campaigns`,
        `${Math.round(bounceRate7d * 100)}% bounce`,
        `${Math.round(failureRate7d * 100)}% failure`,
        `${entry.complaintCount14d} complaints`,
      ].join(' | ')

      return {
        domain: entry.domain,
        providerHint: entry.providerHint,
        mailboxCount: entry.mailboxCount,
        healthyCount: entry.healthyCount,
        warmingCount: entry.warmingCount,
        atRiskCount: entry.atRiskCount,
        pausedCount: entry.pausedCount,
        averageHealthScore,
        activeCampaignCount,
        sentCount7d: entry.sentCount7d,
        failedCount7d: entry.failedCount7d,
        bouncedCount7d: entry.bouncedCount7d,
        bounceRate7d,
        failureRate7d,
        complaintCount14d: entry.complaintCount14d,
        healthStatus,
        notes,
      }
    })
    .sort((a, b) => {
      if (b.atRiskCount !== a.atRiskCount) return b.atRiskCount - a.atRiskCount
      if (b.pausedCount !== a.pausedCount) return b.pausedCount - a.pausedCount
      return a.domain.localeCompare(b.domain)
    })
}

// GET /api/mail-accounts
export async function GET(request: NextRequest) {
  try {
    const resource = request.nextUrl.searchParams.get('resource')
    if (resource === 'warmup-recipients') {
      const recipients = await prisma.warmupRecipient.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          isSystem: true,
          mailAccountId: true,
          createdAt: true,
        },
      })
      return NextResponse.json(recipients)
    }
    if (resource === 'warmup-overview') {
      const accounts = await prisma.mailAccount.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          warmupStatus: true,
          warmupAutoEnabled: true,
          isActive: true,
        },
      })
      const summary = {
        total: accounts.length,
        warming: accounts.filter((a) => a.warmupStatus === 'WARMING').length,
        warmed: accounts.filter((a) => a.warmupStatus === 'WARMED').length,
        cold: accounts.filter((a) => a.warmupStatus === 'COLD').length,
        paused: accounts.filter((a) => a.warmupStatus === 'PAUSED').length,
        autoEnabled: accounts.filter((a) => a.warmupAutoEnabled).length,
        activeMailboxes: accounts.filter((a) => a.isActive).length,
      }
      return NextResponse.json(summary)
    }
    if (resource === 'warmup-logs') {
      const limit = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get('limit') || 25), 100))
      const senderId = request.nextUrl.searchParams.get('senderId')
      const logs = await prisma.warmupMailLog.findMany({
        where: senderId ? { senderMailAccountId: senderId } : undefined,
        orderBy: { sentAt: 'desc' },
        take: limit,
        select: {
          id: true,
          senderMailAccountId: true,
          recipientEmail: true,
          recipientType: true,
          recipientMailAccountId: true,
          direction: true,
          subject: true,
          status: true,
          stage: true,
          sentAt: true,
          errorMessage: true,
          senderMailAccount: { select: { email: true, displayName: true } },
          recipientMailAccount: { select: { email: true, displayName: true } },
        },
      })
      return NextResponse.json(logs)
    }
    if (resource === 'mailbox-health') {
      const snapshots = await prisma.warmupHealthSnapshot.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          mailAccountId: true,
          periodStart: true,
          periodEnd: true,
          healthScore: true,
          healthStatus: true,
          inboxRate: true,
          spamRate: true,
          readRate: true,
          replyRate: true,
          rescueRate: true,
          sentCount: true,
          receivedCount: true,
          rescuedCount: true,
          notes: true,
          createdAt: true,
          mailAccount: {
            select: { email: true, displayName: true, type: true },
          },
        },
      })
      return NextResponse.json(snapshots)
    }
    if (resource === 'mailbox-messages') {
      const mailAccountId = request.nextUrl.searchParams.get('mailAccountId') || undefined
      const folderKind = request.nextUrl.searchParams.get('folderKind') || undefined
      const messages = await prisma.mailboxMessage.findMany({
        where: {
          ...(mailAccountId ? { mailAccountId } : {}),
          ...(folderKind ? { folderKind: folderKind as 'INBOX' | 'SPAM' | 'SENT' | 'ARCHIVE' | 'OTHER' } : {}),
        },
        orderBy: [{ receivedAt: 'desc' }, { sentAt: 'desc' }],
        take: 100,
        select: {
          id: true,
          mailAccountId: true,
          providerMessageId: true,
          providerThreadId: true,
          folderKind: true,
          folderName: true,
          direction: true,
          fromEmail: true,
          toEmail: true,
          subject: true,
          snippet: true,
          sentAt: true,
          receivedAt: true,
          isWarmup: true,
          isRead: true,
          isStarred: true,
          isSpam: true,
          openedAt: true,
          repliedAt: true,
          rescuedAt: true,
          createdAt: true,
          mailAccount: { select: { email: true, displayName: true, type: true } },
        },
      })
      return NextResponse.json(messages)
    }
    if (resource === 'domain-health') {
      const [domains, history] = await Promise.all([
        buildDomainHealthSummary(),
        prisma.domainHealthSnapshot.findMany({
          orderBy: [{ periodEnd: 'desc' }, { domain: 'asc' }],
          take: 60,
          select: {
            id: true,
            domain: true,
            providerHint: true,
            periodStart: true,
            periodEnd: true,
            mailboxCount: true,
            healthyCount: true,
            warmingCount: true,
            atRiskCount: true,
            pausedCount: true,
            averageHealthScore: true,
            activeCampaignCount: true,
            sentCount7d: true,
            failedCount7d: true,
            bouncedCount7d: true,
            bounceRate7d: true,
            failureRate7d: true,
            complaintCount14d: true,
            notes: true,
            createdAt: true,
          },
        }),
      ])
      return NextResponse.json({ domains, history })
    }
    if (resource === 'domain-diagnostics') {
      const accounts = await prisma.mailAccount.findMany({
        select: { email: true, type: true },
      })
      const uniqueDomainMap = new Map<string, { domain: string; providerHint: DomainProviderHint }>()
      for (const account of accounts) {
        const domain = extractEmailDomain(account.email)
        if (!domain) continue
        const providerHint = providerHintFromType(account.type)
        uniqueDomainMap.set(`${domain}:${providerHint}`, { domain, providerHint })
      }
      const uniqueDomains = Array.from(uniqueDomainMap.values())

      const diagnostics = await Promise.all(
        uniqueDomains.map((entry) => getDomainDiagnostics(entry.domain, entry.providerHint))
      )
      return NextResponse.json(diagnostics)
    }
    if (resource === 'whatsapp-accounts') {
      const accounts = await prisma.whatsAppAccount.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          displayName: true,
          phoneNumber: true,
          isActive: true,
          connectionStatus: true,
          sessionKey: true,
          lastQr: true,
          lastConnectedAt: true,
          lastError: true,
          dailyLimit: true,
          sentToday: true,
          lastMessageSentAt: true,
          createdAt: true,
          _count: { select: { sentMessages: true } },
        },
      })
      return NextResponse.json(accounts)
    }

    const accounts = await prisma.mailAccount.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        email: true,
        displayName: true,
        dailyLimit: true,
        sentToday: true,
        isActive: true,
        warmupStatus: true,
        warmupStage: true,
        warmupStartedAt: true,
        warmupCompletedAt: true,
        warmupPausedAt: true,
        recommendedDailyLimit: true,
        warmupAutoEnabled: true,
        createdAt: true,
        lastMailSentAt: true,
        lastResetAt: true,
        tokenExpiry: true,
        zohoRefreshToken: true,
        zohoAccountId: true,
        zohoRegion: true,
        zohoTokenExpiry: true,
        zohoMailboxMode: true,
        zohoLastTokenRefreshAt: true,
        zohoAuthError: true,
        imapHost: true,
        imapPort: true,
        imapSecure: true,
        mailboxLastSyncedAt: true,
        mailboxSyncStatus: true,
        mailboxSyncError: true,
        mailboxHealthScore: true,
        mailboxHealthStatus: true,
        _count: { select: { sentMails: true } },
        warmupHealthSnapshots: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            periodEnd: true,
            healthScore: true,
            healthStatus: true,
            inboxRate: true,
            spamRate: true,
            readRate: true,
            replyRate: true,
            rescueRate: true,
            notes: true,
          },
        },
      },
    })

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const warmupLogs = await prisma.warmupMailLog.findMany({
      where: {
        senderMailAccountId: { in: accounts.map((a) => a.id) },
        sentAt: { gte: since },
      },
      select: {
        senderMailAccountId: true,
        status: true,
      },
    })

    const statsByAccount = new Map<string, { total: number; sent: number; failed: number; bounced: number }>()
    for (const log of warmupLogs) {
      const current = statsByAccount.get(log.senderMailAccountId) || { total: 0, sent: 0, failed: 0, bounced: 0 }
      current.total += 1
      if (log.status === 'sent') current.sent += 1
      if (log.status === 'failed') current.failed += 1
      if (log.status === 'bounced') current.bounced += 1
      statsByAccount.set(log.senderMailAccountId, current)
    }

    const withWarmupStats = accounts.map((account) => {
      const stats = statsByAccount.get(account.id) || { total: 0, sent: 0, failed: 0, bounced: 0 }
      const successRate = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0
      const { zohoRefreshToken, ...safeAccount } = account
      const zohoImapEnabled =
        safeAccount.type !== 'zoho' ||
        safeAccount.zohoMailboxMode !== 'imap' ||
        safeAccount.mailboxSyncError !== ZOHO_IMAP_DISABLED_MESSAGE
      const mailboxConnectionMethod =
        safeAccount.type === 'zoho' ? safeAccount.zohoMailboxMode : safeAccount.type === 'gmail' ? 'oauth' : 'unknown'
      const zohoApiConnected = safeAccount.type === 'zoho' && safeAccount.zohoMailboxMode === 'api' && Boolean(zohoRefreshToken)
      const mailboxSyncAvailable =
        safeAccount.type === 'gmail' ||
        (safeAccount.type === 'zoho' && (
          (safeAccount.zohoMailboxMode === 'api' && zohoApiConnected) ||
          (safeAccount.zohoMailboxMode === 'imap' && zohoImapEnabled)
        ))
      return {
        ...safeAccount,
        mailboxConnectionMethod,
        zohoApiConnected,
        mailboxSyncAvailable,
        zohoImapEnabled,
        mailboxSyncError:
          safeAccount.mailboxSyncError === ZOHO_IMAP_DISABLED_MESSAGE ? null : safeAccount.mailboxSyncError,
        warmupStats7d: {
          ...stats,
          successRate,
        },
      }
    })
    return NextResponse.json(withWarmupStats)
  } catch (error) {
    console.error('[Mail Accounts GET]', error)
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }
}

// POST /api/mail-accounts?resource=warmup-recipients
export async function POST(request: NextRequest) {
  try {
    const resource = request.nextUrl.searchParams.get('resource')
    if (resource === 'whatsapp-accounts') {
      const body = await request.json() as {
        displayName: string
        phoneNumber?: string
        dailyLimit?: number
      }
      if (!body.displayName?.trim()) {
        return NextResponse.json({ error: 'displayName is required' }, { status: 400 })
      }

      const normalizedPhone = body.phoneNumber?.trim() || null
      const sessionKey = `${body.displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
      const account = await prisma.whatsAppAccount.create({
        data: {
          displayName: body.displayName.trim(),
          phoneNumber: normalizedPhone,
          dailyLimit: Math.max(1, body.dailyLimit ?? 40),
          sessionKey,
          connectionStatus: 'QR_PENDING',
          isActive: true,
        },
        select: { id: true, displayName: true, phoneNumber: true, sessionKey: true },
      })
      await getWhatsAppSessionQueue().add(
        'connect-whatsapp-session' as never,
        { whatsappAccountId: account.id, mode: 'connect' } as never,
        { jobId: `wa-connect-${account.id}-${Date.now()}` }
      )
      return NextResponse.json({ success: true, account }, { status: 201 })
    }

    if (resource === 'warmup-recipients-bulk') {
      const body = await request.json() as { entries?: string; isActive?: boolean }
      const rawEntries = body.entries || ''
      const emails = Array.from(
        new Set(
          rawEntries
            .split(/[\s,;\n\r\t]+/)
            .map((value) => value.trim().toLowerCase())
            .filter((value) => value.includes('@'))
        )
      )

      if (emails.length === 0) {
        return NextResponse.json({ error: 'Add at least one valid email address' }, { status: 400 })
      }

      const operations = emails.map((email) =>
        prisma.warmupRecipient.upsert({
          where: { email },
          create: {
            email,
            isActive: body.isActive ?? true,
            isSystem: false,
          },
          update: {
            isActive: body.isActive ?? true,
            isSystem: false,
          },
          select: { id: true, email: true },
        })
      )
      const recipients = await prisma.$transaction(operations)
      return NextResponse.json({ success: true, count: recipients.length, recipients }, { status: 201 })
    }

    if (resource !== 'warmup-recipients') {
      return NextResponse.json({ error: 'Unsupported POST target' }, { status: 400 })
    }

    const body = await request.json() as { email: string; name?: string; isActive?: boolean }
    if (!body.email || !body.email.includes('@')) {
      return NextResponse.json({ error: 'Valid recipient email is required' }, { status: 400 })
    }

    const recipient = await prisma.warmupRecipient.upsert({
      where: { email: body.email.trim().toLowerCase() },
      create: {
        email: body.email.trim().toLowerCase(),
        name: body.name?.trim() || null,
        isActive: body.isActive ?? true,
        isSystem: false,
      },
      update: {
        name: body.name?.trim() || undefined,
        isActive: body.isActive ?? true,
        isSystem: false,
      },
      select: { id: true, email: true, name: true, isActive: true, isSystem: true },
    })

    return NextResponse.json({ success: true, recipient }, { status: 201 })
  } catch (error) {
    console.error('[Warmup Recipient POST]', error)
    return NextResponse.json({ error: 'Failed to save warmup recipient' }, { status: 500 })
  }
}

// PATCH /api/mail-accounts — Toggle active status or update daily limit
export async function PATCH(request: NextRequest) {
  try {
    const resource = request.nextUrl.searchParams.get('resource')
    if (resource === 'whatsapp-accounts') {
      const body = await request.json() as {
        id: string
        isActive?: boolean
        dailyLimit?: number
        displayName?: string
        phoneNumber?: string | null
        connectionStatus?: 'DISCONNECTED' | 'QR_PENDING' | 'CONNECTED' | 'ERROR'
        lastQr?: string | null
        lastError?: string | null
        reconnect?: boolean
      }
      if (!body.id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }
      const updated = await prisma.whatsAppAccount.update({
        where: { id: body.id },
        data: {
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.dailyLimit !== undefined ? { dailyLimit: Math.max(1, body.dailyLimit) } : {}),
          ...(body.displayName !== undefined ? { displayName: body.displayName.trim() } : {}),
          ...(body.phoneNumber !== undefined ? { phoneNumber: body.phoneNumber?.trim() || null } : {}),
          ...(body.connectionStatus !== undefined ? { connectionStatus: body.connectionStatus } : {}),
          ...(body.lastQr !== undefined ? { lastQr: body.lastQr } : {}),
          ...(body.lastError !== undefined ? { lastError: body.lastError } : {}),
          ...(body.reconnect ? { connectionStatus: 'QR_PENDING', lastQr: null, lastError: null, isActive: true } : {}),
          ...(body.connectionStatus === 'CONNECTED' ? { lastConnectedAt: new Date() } : {}),
        },
      })
      if (body.reconnect) {
        await getWhatsAppSessionQueue().add(
          'reconnect-whatsapp-session' as never,
          { whatsappAccountId: updated.id, mode: 'reconnect' } as never,
          { jobId: `wa-reconnect-${updated.id}-${Date.now()}` }
        )
      }
      return NextResponse.json({ success: true, id: updated.id })
    }

    if (resource === 'warmup-recipients') {
      const body = await request.json() as {
        id: string
        isActive?: boolean
        name?: string | null
      }
      if (!body.id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }

      const existing = await prisma.warmupRecipient.findUnique({ where: { id: body.id } })
      if (!existing) {
        return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
      }
      if (existing.isSystem && body.isActive === false) {
        return NextResponse.json(
          { error: 'System recipients cannot be deactivated here. Disable the mailbox instead.' },
          { status: 400 }
        )
      }

      const recipient = await prisma.warmupRecipient.update({
        where: { id: body.id },
        data: {
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.name !== undefined ? { name: body.name?.trim() || null } : {}),
        },
        select: { id: true, email: true, name: true, isActive: true, isSystem: true },
      })

      return NextResponse.json({ success: true, recipient })
    }

    if (resource === 'mailbox-messages') {
      const body = await request.json() as {
        mailAccountId: string
        mailboxMessageId: string
        action: 'mark-read' | 'rescue-to-inbox' | 'reply'
        subject?: string
        html?: string
      }

      if (!body.mailAccountId || !body.mailboxMessageId || !body.action) {
        return NextResponse.json({ error: 'mailAccountId, mailboxMessageId, and action are required' }, { status: 400 })
      }

      const [account, message] = await Promise.all([
        prisma.mailAccount.findUnique({ where: { id: body.mailAccountId } }),
        prisma.mailboxMessage.findUnique({ where: { id: body.mailboxMessageId } }),
      ])

      if (!account || !message || message.mailAccountId !== body.mailAccountId) {
        return NextResponse.json({ error: 'Mailbox message not found' }, { status: 404 })
      }

      const messageRef = {
        providerMessageId: message.providerMessageId,
        providerThreadId: message.providerThreadId,
        fromEmail: message.fromEmail,
        toEmail: message.toEmail,
        subject: message.subject,
        metadata: (message.metadata as Record<string, unknown> | null) ?? null,
      }

      if (body.action === 'mark-read') {
        await markMailboxMessageAsRead(account, messageRef)
        await prisma.mailboxMessage.update({
          where: { id: message.id },
          data: {
            isRead: true,
            openedAt: message.openedAt ?? new Date(),
          },
        })
        return NextResponse.json({ success: true })
      }

      if (body.action === 'rescue-to-inbox') {
        await rescueMailboxMessageToInbox(account, messageRef)
        await prisma.mailboxMessage.update({
          where: { id: message.id },
          data: {
            isRead: true,
            isSpam: false,
            folderKind: 'INBOX',
            folderName: 'Inbox',
            rescuedAt: new Date(),
            openedAt: message.openedAt ?? new Date(),
          },
        })
        return NextResponse.json({ success: true })
      }

      const subject = body.subject?.trim() || (message.subject?.trim().startsWith('Re:') ? message.subject : `Re: ${message.subject || 'Quick follow-up'}`)
      const html = body.html?.trim()
      if (!html) {
        return NextResponse.json({ error: 'Reply body is required' }, { status: 400 })
      }

      await replyToMailboxMessage(account, messageRef, { subject, html })
      await prisma.mailboxMessage.update({
        where: { id: message.id },
        data: {
          repliedAt: new Date(),
          isRead: true,
          openedAt: message.openedAt ?? new Date(),
        },
      })
      return NextResponse.json({ success: true })
    }

    const body = await request.json() as {
      id: string
      isActive?: boolean
      dailyLimit?: number
      warmupStatus?: WarmupStatus
      warmupStage?: number
      warmupAutoEnabled?: boolean
      zohoImapEnabled?: boolean
      zohoMailboxMode?: 'imap' | 'api'
      runWarmupNow?: boolean
      runMailboxSyncNow?: boolean
    }
    const { id, isActive, dailyLimit, warmupStatus, warmupStage, warmupAutoEnabled, zohoImapEnabled, zohoMailboxMode, runWarmupNow, runMailboxSyncNow } = body

    const account = await prisma.mailAccount.findUnique({ where: { id } })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const nextWarmupStatus = warmupStatus ?? account.warmupStatus
    if (isActive === true && nextWarmupStatus !== 'WARMED') {
      return NextResponse.json(
        { error: 'Only WARMED mailboxes can be activated for campaign sending.' },
        { status: 400 }
      )
    }
    if (isActive === true) {
      const domain = extractEmailDomain(account.email)
      if (domain) {
        const providerHint = providerHintFromType(account.type)
        const diagnostics = await getDomainDiagnostics(domain, providerHint)
        const blockers = getDomainDiagnosticsBlockers(diagnostics)
        if (blockers.length > 0) {
          return NextResponse.json(
            { error: `Mailbox activation blocked by domain safety checks: ${blockers.join(', ')}` },
            { status: 400 }
          )
        }
      }
    }

    const data: Record<string, unknown> = {
      ...(dailyLimit !== undefined ? { dailyLimit: Math.max(1, dailyLimit) } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(warmupAutoEnabled !== undefined ? { warmupAutoEnabled } : {}),
    }

    if (zohoMailboxMode && account.type === 'zoho') {
      data.zohoMailboxMode = zohoMailboxMode
      data.mailboxSyncStatus = 'idle'
      data.mailboxSyncError = null
      data.zohoAuthError = null
    }

    if (zohoImapEnabled !== undefined && account.type === 'zoho' && (zohoMailboxMode ?? account.zohoMailboxMode) === 'imap') {
      data.mailboxSyncStatus = 'idle'
      data.mailboxSyncError = zohoImapEnabled ? null : ZOHO_IMAP_DISABLED_MESSAGE
    }

    if (warmupStatus) {
      data.warmupStatus = warmupStatus
      if (warmupStatus === 'COLD') {
        data.warmupStage = 0
        data.warmupStartedAt = null
        data.warmupCompletedAt = null
        data.warmupPausedAt = null
        data.recommendedDailyLimit = recommendedLimitFromStage(0)
        data.isActive = false
      }
      if (warmupStatus === 'WARMING') {
        const stage = Math.max(0, warmupStage ?? account.warmupStage ?? 0)
        data.warmupStage = stage
        data.warmupStartedAt = account.warmupStartedAt ?? new Date()
        data.warmupPausedAt = null
        data.recommendedDailyLimit = recommendedLimitFromStage(stage)
        data.isActive = false
      }
      if (warmupStatus === 'WARMED') {
        const stage = Math.max(warmupStage ?? account.warmupStage ?? 0, WARMUP_LIMIT_PLAN.length - 1)
        data.warmupStage = stage
        data.warmupCompletedAt = account.warmupCompletedAt ?? new Date()
        data.warmupPausedAt = null
        data.recommendedDailyLimit = Math.max(dailyLimit ?? account.dailyLimit, recommendedLimitFromStage(stage))
      }
      if (warmupStatus === 'PAUSED') {
        data.warmupPausedAt = new Date()
        data.isActive = false
      }
    } else if (warmupStage !== undefined) {
      const stage = Math.max(0, warmupStage)
      data.warmupStage = stage
      data.recommendedDailyLimit = recommendedLimitFromStage(stage)
    }

    const updated = await prisma.mailAccount.update({
      where: { id },
      data,
    })

    if (runWarmupNow) {
      if (updated.warmupStatus !== 'WARMING') {
        return NextResponse.json(
          { error: 'Warmup can only be triggered while the mailbox is in WARMING status.' },
          { status: 400 }
        )
      }
      if (!updated.warmupAutoEnabled) {
        return NextResponse.json(
          { error: 'Warmup automation is off. Turn Auto ON before testing a warmup tick.' },
          { status: 400 }
        )
      }

      await getWarmupQueue().add(
        'process-warmup' as never,
        { mailAccountId: updated.id } as never,
        { jobId: `warmup-manual-${updated.id}-${Date.now()}` }
      )
    }

    if (runMailboxSyncNow) {
      if (updated.type === 'zoho' && updated.zohoMailboxMode === 'imap' && updated.mailboxSyncError === ZOHO_IMAP_DISABLED_MESSAGE) {
        return NextResponse.json(
          { error: 'Zoho IMAP is OFF for this mailbox. Turn it on before syncing.' },
          { status: 400 }
        )
      }
      if (updated.type === 'zoho' && updated.zohoMailboxMode === 'api' && (!updated.zohoRefreshToken || updated.zohoAuthError === ZOHO_API_RECONNECT_MESSAGE)) {
        return NextResponse.json(
          { error: 'Reconnect Zoho before syncing this mailbox.' },
          { status: 400 }
        )
      }
      await getMailboxSyncQueue().add(
        'sync-mailbox' as never,
        { mailAccountId: updated.id, reason: 'manual' } as never,
        { jobId: `mailbox-sync-manual-${updated.id}-${Date.now()}` }
      )
    }

    await prisma.warmupRecipient.upsert({
      where: { email: updated.email },
      create: {
        email: updated.email,
        name: updated.displayName,
        isActive: true,
        isSystem: true,
        mailAccountId: updated.id,
      },
      update: {
        name: updated.displayName,
        isSystem: true,
        mailAccountId: updated.id,
        isActive: true,
      },
    })

    return NextResponse.json({ success: true, id: updated.id })
  } catch (error) {
    console.error('[Mail Accounts PATCH]', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

// DELETE /api/mail-accounts?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const resource = request.nextUrl.searchParams.get('resource')
    if (resource === 'warmup-recipients') {
      const id = request.nextUrl.searchParams.get('id')
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
      const existing = await prisma.warmupRecipient.findUnique({ where: { id } })
      if (!existing) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
      if (existing.isSystem) {
        return NextResponse.json({ error: 'System recipients cannot be deleted manually' }, { status: 400 })
      }
      await prisma.warmupRecipient.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }
    if (resource === 'whatsapp-accounts') {
      const id = request.nextUrl.searchParams.get('id')
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
      await prisma.whatsAppAccount.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const account = await prisma.mailAccount.findUnique({ where: { id }, select: { email: true } })
    await prisma.mailAccount.delete({ where: { id } })
    if (account?.email) {
      await prisma.warmupRecipient.deleteMany({
        where: { email: account.email, isSystem: true },
      })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Mail Accounts DELETE]', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
