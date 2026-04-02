import { NextResponse } from 'next/server'
import { getZohoAuthUrl } from '@/lib/zohoMailApi'

export async function GET() {
  return NextResponse.redirect(getZohoAuthUrl())
}
