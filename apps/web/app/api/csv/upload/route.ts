import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { parseCSVBuffer } from '@/lib/csv-parser/parser'
import { detectColumns } from '@/lib/csv-parser/column-detector'
import { prisma } from '@/lib/prisma'

// Upload dir — stored inside the project for simplicity
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'csv')

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'Only CSV files are allowed' }, { status: 400 })
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Parse CSV
    const { headers, rows, preview } = parseCSVBuffer(buffer)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 })
    }

    // Auto-detect column mappings
    const detectedMapping = detectColumns(headers, preview)

    // Save file to disk
    await mkdir(UPLOAD_DIR, { recursive: true })
    const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`
    const filePath = path.join(UPLOAD_DIR, fileName)
    await writeFile(filePath, buffer)

    // Save CsvFile record + all CsvRows to DB
    const csvFile = await prisma.csvFile.create({
      data: {
        originalName: file.name,
        storagePath: filePath,
        rowCount: rows.length,
        columnMap: detectedMapping,  // AI-detected, user can edit later
        rows: {
          create: rows.map((row, index) => ({
            rowIndex: index,
            rawData: row,
            name: detectedMapping['name']
              ? (row[Object.keys(detectedMapping).find(k => detectedMapping[k] === 'name') || ''] || null)
              : null,
            website: detectedMapping['website']
              ? (row[Object.keys(detectedMapping).find(k => detectedMapping[k] === 'website') || ''] || null)
              : null,
            email: (() => {
              const col = Object.keys(detectedMapping).find(k => detectedMapping[k] === 'email')
              return col ? (row[col] || null) : null
            })(),
            whatsapp: (() => {
              const col = Object.keys(detectedMapping).find(k => detectedMapping[k] === 'phone')
              return col ? (row[col] || null) : null
            })(),
          })),
        },
      },
    })

    return NextResponse.json({
      id: csvFile.id,
      originalName: csvFile.originalName,
      rowCount: csvFile.rowCount,
      headers,
      detectedMapping,
      preview,
    })
  } catch (error) {
    console.error('[CSV Upload]', error)
    return NextResponse.json({ error: 'Internal server error during upload' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const files = await prisma.csvFile.findMany({
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        rowCount: true,
        columnMap: true,
        uploadedAt: true,
        _count: { select: { campaigns: true } },
      },
    })
    return NextResponse.json(files)
  } catch (error) {
    console.error('[CSV List]', error)
    return NextResponse.json({ error: 'Failed to fetch CSV files' }, { status: 500 })
  }
}
