import { NextRequest, NextResponse } from 'next/server'
import { generateOutreachEmail } from '@/lib/gemini'
import { prisma } from '@/lib/prisma'

// POST /api/campaigns/[id]/preview — Generate a sample email with Gemini
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      prompt: string
      campaignType: 'indian' | 'international'
      rowIndex?: number
    }

    const { prompt, campaignType, rowIndex = 0 } = body

    if (!prompt || prompt.trim().length < 10) {
      return NextResponse.json({ error: 'Prompt too short' }, { status: 400 })
    }

    // Fetch a sample row from the campaign's CSV file
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        csvFile: {
          include: {
            rows: {
              skip: rowIndex,
              take: 1,
              orderBy: { rowIndex: 'asc' },
            },
          },
        },
      },
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const sampleRow = campaign.csvFile.rows[0]

    const generated = await generateOutreachEmail({
      prompt,
      agencyName: sampleRow?.name ?? 'Sample Agency',
      website: sampleRow?.website ?? undefined,
      scrapedContent: undefined,
      campaignType,
    })

    return NextResponse.json({
      subject: generated.subject,
      body: generated.body,
      usedRow: {
        name: sampleRow?.name,
        website: sampleRow?.website,
        email: sampleRow?.email,
      },
    })
  } catch (error) {
    console.error('[Campaign Preview]', error)
    return NextResponse.json(
      { error: 'Failed to generate preview. Check your Gemini API key.' },
      { status: 500 }
    )
  }
}
