import { NextRequest, NextResponse } from 'next/server'
import { exchangeZohoCodeWithBaseUrl } from '@/lib/zohoMailApi'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')
  // Use the explicitly configured public URL — request.nextUrl.origin returns
  // the internal k8s pod hostname (e.g. outbound-web-xxx:3000) behind an ingress.
  const baseUrl =
    (process.env.NEXTAUTH_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, '') ||
    request.nextUrl.origin

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/mail-accounts?error=${encodeURIComponent(error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/mail-accounts?error=${encodeURIComponent('Zoho OAuth code missing')}`
    )
  }

  try {
    const { email } = await exchangeZohoCodeWithBaseUrl(code, baseUrl)
    return NextResponse.redirect(
      `${baseUrl}/mail-accounts?success=${encodeURIComponent(`Zoho account ${email} connected!`)}`
    )
  } catch (error) {
    console.error('[Zoho Callback]', error)
    return NextResponse.redirect(
      `${baseUrl}/mail-accounts?error=${encodeURIComponent('Failed to connect Zoho account')}`
    )
  }
}
