import { NextRequest, NextResponse } from 'next/server'
import { exchangeZohoCode } from '@/lib/zohoMailApi'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/mail-accounts?error=${encodeURIComponent(error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/mail-accounts?error=${encodeURIComponent('Zoho OAuth code missing')}`
    )
  }

  try {
    const { email } = await exchangeZohoCode(code)
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/mail-accounts?success=${encodeURIComponent(`Zoho account ${email} connected!`)}`
    )
  } catch (error) {
    console.error('[Zoho Callback]', error)
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/mail-accounts?error=${encodeURIComponent('Failed to connect Zoho account')}`
    )
  }
}
