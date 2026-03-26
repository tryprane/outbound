import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8000'
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'csv')

const ExtractSchema = z.object({
  sourceCsvFileId: z.string().min(1),
  extractionName: z.string().min(1),
  campaignType: z.enum(['indian', 'international']).default('indian'),
  websiteColumn: z.string().min(1),
  extractEmail: z.boolean().default(true),
  extractPhone: z.boolean().default(true),
})

type BulkScrapeItem = {
  url: string
  email?: string
  phone?: string
  success: boolean
  error?: string | null
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = ExtractSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      )
    }

    const {
      sourceCsvFileId,
      extractionName,
      campaignType,
      websiteColumn,
      extractEmail,
      extractPhone,
    } = parsed.data

    if (!extractEmail && !extractPhone) {
      return NextResponse.json(
        { error: 'Select at least one extraction target (email and/or phone).' },
        { status: 400 }
      )
    }

    const sourceCsv = await prisma.csvFile.findUnique({
      where: { id: sourceCsvFileId },
      include: { rows: { orderBy: { rowIndex: 'asc' } } },
    })

    if (!sourceCsv) {
      return NextResponse.json({ error: 'Source CSV file not found.' }, { status: 404 })
    }

    const extractTargets: Array<'email' | 'phone'> = []
    if (extractEmail) extractTargets.push('email')
    if (extractPhone) extractTargets.push('phone')

    const rowJobs = sourceCsv.rows.map((row) => {
      const raw = row.rawData as Record<string, string>
      const website = normalizeUrl(raw[websiteColumn] || row.website || '')
      return { row, raw, website }
    })

    const validJobs = rowJobs.filter((job) => Boolean(job.website))
    const scrapedByUrl = new Map<string, { email?: string; phone?: string; success: boolean; error?: string | null }>()

    const chunkSize = 20
    for (let i = 0; i < validJobs.length; i += chunkSize) {
      const chunk = validJobs.slice(i, i + chunkSize)
      const urls = chunk.map((j) => j.website)

      const scraperRes = await fetch(`${SCRAPER_URL}/scrape/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls,
          campaign_type: campaignType,
          extract: extractTargets,
          concurrency: 5,
        }),
        signal: AbortSignal.timeout(120_000),
      })

      if (!scraperRes.ok) {
        const text = await scraperRes.text()
        return NextResponse.json(
          { error: `Scraper failed for extraction batch: ${text || scraperRes.statusText}` },
          { status: 502 }
        )
      }

      const payload = (await scraperRes.json()) as { results: BulkScrapeItem[] }
      for (const result of payload.results || []) {
        scrapedByUrl.set(result.url, {
          email: result.email,
          phone: result.phone,
          success: result.success,
          error: result.error,
        })
      }
    }

    const firstRaw = (sourceCsv.rows[0]?.rawData || {}) as Record<string, string>
    const originalHeaders = Object.keys(firstRaw)
    const finalHeaders = [
      ...originalHeaders,
      'website_normalized',
      'scraped_email',
      'scraped_phone',
      'final_email',
      'final_phone',
      'scrape_status',
      'scrape_error',
    ]

    const extractedRows = rowJobs.map((job, index) => {
      const sourceResult = job.website ? scrapedByUrl.get(job.website) : undefined
      const scrapedEmail = sourceResult?.email || null
      const scrapedPhone = sourceResult?.phone || null
      const finalEmail = job.row.email || scrapedEmail || null
      const finalPhone = job.row.whatsapp || scrapedPhone || null
      const scrapeStatus = !job.website
        ? 'failed'
        : sourceResult?.success
          ? 'done'
          : 'failed'
      const scrapeError = !job.website
        ? 'Missing website URL'
        : sourceResult?.error || null

      const rawData = {
        ...job.raw,
        website_normalized: job.website || '',
        scraped_email: scrapedEmail || '',
        scraped_phone: scrapedPhone || '',
        final_email: finalEmail || '',
        final_phone: finalPhone || '',
        scrape_status: scrapeStatus,
        scrape_error: scrapeError || '',
      }

      return {
        rowIndex: index,
        rawData,
        name: job.row.name,
        website: job.website || job.row.website || null,
        email: finalEmail,
        whatsapp: finalPhone,
        scrapedEmail,
        scrapedPhone,
        scrapeStatus,
      }
    })

    const csvLines = [
      finalHeaders.map(csvEscape).join(','),
      ...extractedRows.map((row) =>
        finalHeaders.map((header) => csvEscape((row.rawData as Record<string, string>)[header] || '')).join(',')
      ),
    ]
    const csvContent = csvLines.join('\n')

    await mkdir(UPLOAD_DIR, { recursive: true })
    const safeName = extractionName.trim().replace(/[^\w.-]+/g, '_')
    const fileName = `${Date.now()}-${safeName}-extracted.csv`
    const filePath = path.join(UPLOAD_DIR, fileName)
    await writeFile(filePath, csvContent, 'utf-8')

    const generatedCsv = await prisma.csvFile.create({
      data: {
        originalName: `${extractionName.trim()} (Extracted).csv`,
        storagePath: filePath,
        rowCount: extractedRows.length,
        columnMap: {
          [websiteColumn]: 'website',
          final_email: 'email',
          final_phone: 'phone',
        },
        rows: {
          create: extractedRows,
        },
      },
      select: { id: true, originalName: true, rowCount: true },
    })

    const doneCount = extractedRows.filter((r) => r.scrapeStatus === 'done').length
    const failedCount = extractedRows.length - doneCount

    return NextResponse.json({
      success: true,
      csvFile: generatedCsv,
      stats: {
        total: extractedRows.length,
        scrapedDone: doneCount,
        scrapedFailed: failedCount,
      },
      message: 'Extraction completed. Use this generated CSV in your Email Campaign.',
    })
  } catch (error) {
    console.error('[CSV Extract]', error)
    return NextResponse.json(
      { error: 'Failed to run extraction campaign. Please try again.' },
      { status: 500 }
    )
  }
}
