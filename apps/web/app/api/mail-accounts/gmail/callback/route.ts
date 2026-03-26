import { NextRequest, NextResponse } from 'next/server'
import { exchangeGmailCode } from '@/lib/mailer/gmail'

// GET /api/mail-accounts/gmail/callback?code=...
// This is the OAuth2 redirect URI that Google sends the code to
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
      `${process.env.NEXTAUTH_URL}/mail-accounts?error=no_code`
    )
  }

  try {
    const { email } = await exchangeGmailCode(code)
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/mail-accounts?success=${encodeURIComponent(`Gmail account ${email} connected!`)}`
    )
  } catch (err) {
    console.error('[Gmail Callback]', err)
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/mail-accounts?error=${encodeURIComponent('Failed to connect Gmail account')}`
    )
  }
}
