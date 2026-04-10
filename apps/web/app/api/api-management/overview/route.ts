import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { evaluateMailAccountGuardrail } from '@/lib/campaignGuardrails'

export const dynamic = 'force-dynamic'

function startOfToday() {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

export async function GET() {
  try {
    const [mailAccounts, whatsappAccounts] = await Promise.all([
      prisma.mailAccount.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          email: true,
          type: true,
          isActive: true,
          warmupStatus: true,
          mailboxHealthStatus: true,
          mailboxHealthScore: true,
          mailboxSyncStatus: true,
          dailyLimit: true,
          sentToday: true,
        },
      }),
      prisma.whatsAppAccount.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          displayName: true,
          isActive: true,
          connectionStatus: true,
          dailyLimit: true,
          sentToday: true,
        },
      }),
    ])

    const todayMailCounts = await prisma.sentMail.groupBy({
      by: ['mailAccountId'],
      where: {
        mailAccountId: { in: mailAccounts.map((account) => account.id) },
        sentAt: { gte: startOfToday() },
      },
      _count: { _all: true },
    })

    const sentTodayByMailAccount = new Map(mailAccounts.map((account) => [account.id, account.sentToday]))
    for (const row of todayMailCounts) {
      sentTodayByMailAccount.set(row.mailAccountId, Math.max(sentTodayByMailAccount.get(row.mailAccountId) ?? 0, row._count._all))
    }

    const eligibleMailAccounts = mailAccounts.filter((account) => {
      const guardrail = evaluateMailAccountGuardrail(account)
      const sentToday = sentTodayByMailAccount.get(account.id) ?? 0
      return guardrail.eligible && sentToday < account.dailyLimit
    })

    const eligibleWhatsAppAccounts = whatsappAccounts.filter(
      (account) =>
        account.isActive &&
        account.connectionStatus === 'CONNECTED' &&
        account.sentToday < account.dailyLimit
    )

    return NextResponse.json({
      email: {
        total: mailAccounts.length,
        active: mailAccounts.filter((account) => account.isActive).length,
        warmed: mailAccounts.filter((account) => account.warmupStatus === 'WARMED').length,
        eligible: eligibleMailAccounts.length,
        remainingQuota: eligibleMailAccounts.reduce(
          (sum, account) => sum + Math.max(0, account.dailyLimit - (sentTodayByMailAccount.get(account.id) ?? 0)),
          0
        ),
      },
      whatsapp: {
        total: whatsappAccounts.length,
        active: whatsappAccounts.filter((account) => account.isActive).length,
        connected: whatsappAccounts.filter((account) => account.connectionStatus === 'CONNECTED').length,
        eligible: eligibleWhatsAppAccounts.length,
        remainingQuota: eligibleWhatsAppAccounts.reduce(
          (sum, account) => sum + Math.max(0, account.dailyLimit - account.sentToday),
          0
        ),
      },
    })
  } catch (error) {
    console.error('[API Management Overview GET]', error)
    return NextResponse.json({ error: 'Failed to load API overview' }, { status: 500 })
  }
}
