import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/campaigns/[id]/pause — Pause an active campaign
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status !== 'active') {
      return NextResponse.json(
        { error: `Cannot pause a campaign with status: ${campaign.status}` },
        { status: 400 }
      )
    }

    const updated = await prisma.campaign.update({
      where: { id: params.id },
      data: { status: 'paused' },
    })

    return NextResponse.json({
      success: true,
      status: updated.status,
      message: 'Campaign paused. Sending will resume when you activate it again.',
    })
  } catch (error) {
    console.error('[Campaign Pause]', error)
    return NextResponse.json({ error: 'Failed to pause campaign' }, { status: 500 })
  }
}
