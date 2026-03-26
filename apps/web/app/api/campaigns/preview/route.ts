import { NextRequest, NextResponse } from 'next/server'
import { generateOutreachEmail } from '@/lib/gemini'
import { prisma } from '@/lib/prisma'

// POST /api/campaigns/preview — Generate a sample email with Gemini (for wizard)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      csvFileId: string
      prompt: string
      campaignType: 'indian' | 'international'
      rowIndex?: number
    }

    const { csvFileId, prompt, campaignType, rowIndex = 0 } = body

    if (!prompt || prompt.trim().length < 10) {
      return NextResponse.json({ error: 'Prompt too short' }, { status: 400 })
    }

    // Fetch a sample row from the CSV
    const csvFile = await prisma.csvFile.findUnique({
      where: { id: csvFileId },
      include: {
        rows: {
          skip: rowIndex,
          take: 1,
          orderBy: { rowIndex: 'asc' },
        },
      },
    })

    if (!csvFile) {
      return NextResponse.json({ error: 'CSV file not found' }, { status: 404 })
    }

    const sampleRow = csvFile.rows[0]

    const generated = await generateOutreachEmail({
      prompt,
      agencyName: sampleRow?.name ?? 'Sample Agency',
      website: sampleRow?.website ?? undefined,
      scrapedContent: undefined, // no live scrape during preview
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
