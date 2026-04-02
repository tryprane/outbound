import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { evaluateMailAccountGuardrail } from '@/lib/campaignGuardrails'

export const dynamic = 'force-dynamic'

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

    const eligibleMailAccounts = mailAccounts.filter((account) => {
      const guardrail = evaluateMailAccountGuardrail(account)
      return guardrail.eligible && account.sentToday < account.dailyLimit
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
          (sum, account) => sum + Math.max(0, account.dailyLimit - account.sentToday),
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
