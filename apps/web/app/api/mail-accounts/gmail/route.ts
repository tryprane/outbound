import { NextRequest, NextResponse } from 'next/server'
import { getGmailAuthUrl, exchangeGmailCode } from '@/lib/mailer/gmail'
import { prisma } from '@/lib/prisma'

// GET /api/mail-accounts/gmail — Redirect to Google OAuth
export async function GET() {
  const url = getGmailAuthUrl()
  return NextResponse.redirect(url)
}

// DELETE /api/mail-accounts/gmail?id=xxx — Remove a Gmail account
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  await prisma.mailAccount.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
