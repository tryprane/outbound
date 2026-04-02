import { NextRequest, NextResponse } from 'next/server'
import { getZohoAuthUrl } from '@/lib/zohoMailApi'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.origin

  try {
    return NextResponse.redirect(getZohoAuthUrl(baseUrl))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start Zoho OAuth'
    return NextResponse.redirect(
      `${baseUrl}/mail-accounts?error=${encodeURIComponent(message)}`
    )
  }
}
