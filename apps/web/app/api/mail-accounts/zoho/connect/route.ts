import { NextResponse } from 'next/server'
import { getZohoAuthUrl } from '@/lib/zohoMailApi'

export async function GET() {
  try {
    return NextResponse.redirect(getZohoAuthUrl())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start Zoho OAuth'
    const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000'
    return NextResponse.redirect(
      `${baseUrl}/mail-accounts?error=${encodeURIComponent(message)}`
    )
  }
}
