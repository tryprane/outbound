import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
      const eligibleCount = await prisma.campaignMailAccount.count({
        where: {
          campaignId: campaign.id,
          mailAccount: {
            isActive: true,
            warmupStatus: 'WARMED',
          },
        },
      })
      if (eligibleCount === 0) {
        return NextResponse.json(
          { error: 'No eligible sender available. Only ACTIVE + WARMED mailboxes can send campaigns.' },
          { status: 400 }
        )
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
      data: { status: 'active' },
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
