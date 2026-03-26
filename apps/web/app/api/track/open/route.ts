import { NextRequest, NextResponse } from 'next/server'
import { recordEmailOpen } from '@/lib/emailOpenTracking'

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64'
)

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim()

  if (token) {
    try {
      await recordEmailOpen(token)
    } catch (error) {
      console.warn('[Track Open]', error)
    }
  }

  return new NextResponse(TRANSPARENT_GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}
