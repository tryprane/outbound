import { NextRequest, NextResponse } from 'next/server'

const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8000'

interface ScrapeRequestBody {
  url: string
  campaign_type?: 'indian' | 'international'
  campaignType?: 'indian' | 'international'
  type?: 'indian' | 'international'
  extract?: ('email' | 'phone')[]
}

interface BulkScrapeRequestBody {
  urls: string[]
  campaign_type?: 'indian' | 'international'
  campaignType?: 'indian' | 'international'
  type?: 'indian' | 'international'
  extract?: ('email' | 'phone')[]
  concurrency?: number
}

/**
 * POST /api/scrape
 * Proxy to Python FastAPI scraper service.
 * Supports single-URL and bulk scraping.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ScrapeRequestBody | BulkScrapeRequestBody

    // Decide route: bulk if 'urls' array present, single if 'url' string
    const isBulk = 'urls' in body && Array.isArray(body.urls)
    const scraperEndpoint = isBulk ? '/scrape/bulk' : '/scrape/website'
    const normalizedCampaignType = body.campaign_type ?? body.campaignType ?? body.type ?? 'indian'
    const payload = {
      ...body,
      campaign_type: normalizedCampaignType,
    }
    delete (payload as Partial<ScrapeRequestBody & BulkScrapeRequestBody>).campaignType
    delete (payload as Partial<ScrapeRequestBody & BulkScrapeRequestBody>).type

    const res = await fetch(`${SCRAPER_URL}${scraperEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // 30s timeout for bulk scraping
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`[Scraper Proxy] HTTP ${res.status}: ${text}`)
      return NextResponse.json(
        { error: `Scraper service error: ${res.statusText}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[Scraper Proxy]', error)
    const isTimeout = error instanceof Error && error.name === 'TimeoutError'
    return NextResponse.json(
      { error: isTimeout ? 'Scraper service timed out' : 'Could not reach scraper service' },
      { status: isTimeout ? 504 : 503 }
    )
  }
}

/**
 * GET /api/scrape/health
 * Check if the Python scraper service is reachable.
 */
export async function GET() {
  try {
    const res = await fetch(`${SCRAPER_URL}/health`, {
      signal: AbortSignal.timeout(5_000),
    })
    const data = await res.json()
    return NextResponse.json({ ok: res.ok, scraper: data })
  } catch {
    return NextResponse.json({ ok: false, error: 'Scraper service unreachable' }, { status: 503 })
  }
}
