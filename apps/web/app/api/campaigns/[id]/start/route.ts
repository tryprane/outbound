import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assessCampaignDomainRisk, evaluateMailAccountGuardrail } from '@/lib/campaignGuardrails'
import { getDomainDiagnostics, getDomainDiagnosticsBlockers } from '@/lib/domainDiagnostics'

// POST /api/campaigns/[id]/start — Activate a campaign (BullMQ picks it up)
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        mailAccounts: true,
        whatsappAccounts: true,
        csvFile: { select: { rowCount: true } },
      },
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status === 'completed') {
      return NextResponse.json({ error: 'Campaign is already completed' }, { status: 400 })
    }

    if (campaign.channel === 'EMAIL') {
      if (campaign.mailAccounts.length === 0) {
        return NextResponse.json({ error: 'No mail accounts assigned to this campaign' }, { status: 400 })
      }
      const assignedAccounts = await prisma.campaignMailAccount.findMany({
        where: { campaignId: campaign.id },
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
      })
      const mailAccounts = assignedAccounts.map((assignment) => assignment.mailAccount)
      const eligibleCount = mailAccounts.filter((account) => evaluateMailAccountGuardrail(account).eligible).length
      if (eligibleCount === 0) {
        return NextResponse.json(
          { error: 'No eligible sender available. Only healthy, synced, ACTIVE + WARMED mailboxes can send campaigns.' },
          { status: 400 }
        )
      }
      const guardrailReason = assessCampaignDomainRisk(mailAccounts)
      if (guardrailReason) {
        return NextResponse.json({ error: guardrailReason }, { status: 400 })
      }
      const diagnostics = await Promise.all(
        mailAccounts.map(async (account) => {
          const domain = account.email.split('@')[1]?.toLowerCase()
          if (!domain) return null
          const providerHint = account.type === 'gmail' || account.type === 'zoho' ? account.type : 'unknown'
          const result = await getDomainDiagnostics(domain, providerHint)
          return { email: account.email, result }
        })
      )
      const criticalDomains = diagnostics
        .filter((item): item is { email: string; result: Awaited<ReturnType<typeof getDomainDiagnostics>> } => Boolean(item))
        .map(({ email, result }) => ({ email, blockers: getDomainDiagnosticsBlockers(result) }))
        .filter((item) => item.blockers.length > 0)
      if (criticalDomains.length > 0) {
        const message = criticalDomains
          .map((item) => `${item.email}: ${item.blockers.join(', ')}`)
          .join(' | ')
        return NextResponse.json({ error: `Sender domain safety checks failed. Fix: ${message}` }, { status: 400 })
      }
    } else {
      if (campaign.whatsappAccounts.length === 0) {
        return NextResponse.json({ error: 'No WhatsApp accounts assigned to this campaign' }, { status: 400 })
      }
      const eligibleWA = await prisma.campaignWhatsAppAccount.count({
        where: {
          campaignId: campaign.id,
          whatsappAccount: { isActive: true, connectionStatus: 'CONNECTED' },
        },
      })
      if (eligibleWA === 0) {
        return NextResponse.json(
          { error: 'No eligible WhatsApp sender available. Only ACTIVE + CONNECTED WhatsApp accounts can send.' },
          { status: 400 }
        )
      }
    }

    const updated = await prisma.campaign.update({
      where: { id: params.id },
      data: { status: 'active', guardrailReason: null },
    })

    return NextResponse.json({
      success: true,
      status: updated.status,
      message: 'Campaign activated. Worker will begin sending shortly.',
    })
  } catch (error) {
    console.error('[Campaign Start]', error)
    return NextResponse.json({ error: 'Failed to start campaign' }, { status: 500 })
  }
}
