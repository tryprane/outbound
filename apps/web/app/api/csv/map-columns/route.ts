import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ColumnMapping } from '@/lib/csv-parser/column-detector'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { id: string; columnMap: ColumnMapping }
    const { id, columnMap } = body

    if (!id || !columnMap) {
      return NextResponse.json({ error: 'Missing id or columnMap' }, { status: 400 })
    }

    // Load the CSV file + all rows
    const csvFile = await prisma.csvFile.findUnique({
      where: { id },
      include: { rows: { orderBy: { rowIndex: 'asc' } } },
    })

    if (!csvFile) {
      return NextResponse.json({ error: 'CSV file not found' }, { status: 404 })
    }

    // Reverse the mapping: standard field → csv column header
    const fieldToCol: Record<string, string> = {}
    for (const [col, field] of Object.entries(columnMap)) {
      if (field !== 'ignore') fieldToCol[field] = col
    }

    // Update each CsvRow with the corrected mapping
    await prisma.$transaction(
      csvFile.rows.map((row) => {
        const raw = row.rawData as Record<string, string>
        return prisma.csvRow.update({
          where: { id: row.id },
          data: {
            name: fieldToCol['name'] ? (raw[fieldToCol['name']] || null) : null,
            website: fieldToCol['website'] ? (raw[fieldToCol['website']] || null) : null,
            email: fieldToCol['email'] ? (raw[fieldToCol['email']] || null) : null,
            whatsapp: fieldToCol['phone'] ? (raw[fieldToCol['phone']] || null) : null,
          },
        })
      })
    )

    // Save updated column map to CsvFile
    await prisma.csvFile.update({
      where: { id },
      data: { columnMap },
    })

    return NextResponse.json({ success: true, message: 'Column mapping saved and rows updated.' })
  } catch (error) {
    console.error('[Map Columns]', error)
    return NextResponse.json({ error: 'Failed to save column mapping' }, { status: 500 })
  }
}
