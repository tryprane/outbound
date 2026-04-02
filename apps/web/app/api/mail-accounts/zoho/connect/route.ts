import { NextRequest, NextResponse } from 'next/server'
import { getZohoAuthUrl } from '@/lib/zohoMailApi'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Use the explicitly configured public URL — request.nextUrl.origin returns
  // the internal k8s pod hostname (e.g. outbound-web-xxx:3000) behind an ingress.
  const baseUrl =
    (process.env.NEXTAUTH_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, '') ||
    request.nextUrl.origin

  try {
    return NextResponse.redirect(getZohoAuthUrl(baseUrl))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start Zoho OAuth'
    return NextResponse.redirect(
      `${baseUrl}/mail-accounts?error=${encodeURIComponent(message)}`
    )
  }
}
