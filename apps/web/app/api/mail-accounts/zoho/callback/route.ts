import { NextRequest, NextResponse } from 'next/server'
import { exchangeZohoCodeWithBaseUrl } from '@/lib/zohoMailApi'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')
  const baseUrl = request.nextUrl.origin

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
