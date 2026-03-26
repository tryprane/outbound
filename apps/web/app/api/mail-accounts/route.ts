import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { whatsappSessionQueue } from '@/lib/whatsappSessionQueue'
import { warmupQueue } from '@/lib/warmupQueue'

const WARMUP_LIMIT_PLAN = [5, 10, 20, 35, 50, 75]
type WarmupStatus = 'COLD' | 'WARMING' | 'WARMED' | 'PAUSED'

function recommendedLimitFromStage(stage: number): number {
  const idx = Math.max(0, Math.min(stage, WARMUP_LIMIT_PLAN.length - 1))
  return WARMUP_LIMIT_PLAN[idx]
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
        _count: { select: { sentMails: true } },
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
      return {
        ...account,
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
      await whatsappSessionQueue.add(
        'connect-whatsapp-session' as never,
        { whatsappAccountId: account.id, mode: 'connect' } as never,
        { jobId: `wa-connect-${account.id}-${Date.now()}` }
      )
      return NextResponse.json({ success: true, account }, { status: 201 })
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
        await whatsappSessionQueue.add(
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

    const body = await request.json() as {
      id: string
      isActive?: boolean
      dailyLimit?: number
      warmupStatus?: WarmupStatus
      warmupStage?: number
      warmupAutoEnabled?: boolean
      runWarmupNow?: boolean
    }
    const { id, isActive, dailyLimit, warmupStatus, warmupStage, warmupAutoEnabled, runWarmupNow } = body

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

    const data: Record<string, unknown> = {
      ...(dailyLimit !== undefined ? { dailyLimit: Math.max(1, dailyLimit) } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(warmupAutoEnabled !== undefined ? { warmupAutoEnabled } : {}),
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

      await warmupQueue.add(
        'process-warmup' as never,
        { mailAccountId: updated.id } as never,
        { jobId: `warmup-manual-${updated.id}-${Date.now()}` }
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
