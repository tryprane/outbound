import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [csvFile, scrapeStatsRaw] = await Promise.all([
      prisma.csvFile.findUnique({
        where: { id: params.id },
        include: {
          rows: {
            orderBy: { rowIndex: 'asc' },
            take: 200, // paginated — front-end can request more
          },
          _count: { select: { rows: true, campaigns: true } },
        },
      }),
      prisma.csvRow.groupBy({
        by: ['scrapeStatus'],
        where: { csvFileId: params.id },
        _count: true,
      })
    ])

    if (!csvFile) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const scrapeStats = {
      pending: scrapeStatsRaw.find(s => s.scrapeStatus === 'pending')?._count || 0,
      running: scrapeStatsRaw.find(s => s.scrapeStatus === 'running')?._count || 0,
      done: scrapeStatsRaw.find(s => s.scrapeStatus === 'done')?._count || 0,
      failed: scrapeStatsRaw.find(s => s.scrapeStatus === 'failed')?._count || 0,
    }

    return NextResponse.json({ ...csvFile, scrapeStats })
  } catch (error) {
    console.error('[CSV Get]', error)
    return NextResponse.json({ error: 'Failed to fetch CSV file' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.csvFile.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CSV Delete]', error)
    return NextResponse.json({ error: 'Failed to delete CSV file' }, { status: 500 })
  }
}
