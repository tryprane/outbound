import { NextRequest, NextResponse } from 'next/server'
import { getGmailAuthUrl } from '@/lib/mailer/gmail'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import { getDomainDiagnostics } from '@/lib/domainDiagnostics'
import { testGmailImapSmtpConnection } from '@/lib/gmailImapMailbox'

// GET /api/mail-accounts/gmail — Redirect to Google OAuth
export async function GET() {
  const url = getGmailAuthUrl()
  return NextResponse.redirect(url)
}

function deriveTrackingDomain(_email: string) {
  return null
}

// POST /api/mail-accounts/gmail — Save or test a Gmail app-password account
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      displayName?: string
      email: string
      smtpHost: string
      smtpPort: number
      imapHost: string
      imapPort: number
      imapSecure?: boolean
      password: string
      dailyLimit?: number
      testOnly?: boolean
    }

    const normalizedEmail = body.email?.trim().toLowerCase()
    if (!normalizedEmail || !body.smtpHost || !body.smtpPort || !body.imapHost || !body.imapPort || !body.password) {
      return NextResponse.json({ error: 'Missing required Gmail IMAP/SMTP fields' }, { status: 400 })
    }

    const test = await testGmailImapSmtpConnection({
      email: normalizedEmail,
      password: body.password,
      smtpHost: body.smtpHost,
      smtpPort: Number(body.smtpPort),
      imapHost: body.imapHost,
      imapPort: Number(body.imapPort),
      imapSecure: body.imapSecure ?? true,
    })

    if (!test.success) {
      return NextResponse.json({ error: `Connection failed: ${test.error}` }, { status: 400 })
    }

    if (body.testOnly) {
      return NextResponse.json({ success: true, message: 'Gmail IMAP and SMTP connection verified!' })
    }

    const encryptedPassword = encrypt(body.password)
    const account = await prisma.mailAccount.upsert({
      where: { email: normalizedEmail },
      create: {
        type: 'gmail',
        email: normalizedEmail,
        displayName: body.displayName?.trim() || normalizedEmail,
        trackingDomain: deriveTrackingDomain(normalizedEmail),
        smtpHost: body.smtpHost,
        smtpPort: Number(body.smtpPort),
        smtpPassword: encryptedPassword,
        imapHost: body.imapHost,
        imapPort: Number(body.imapPort),
        imapSecure: body.imapSecure ?? true,
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null,
        mailboxSyncStatus: 'idle',
        mailboxSyncError: null,
        mailboxHealthStatus: 'cold',
        dailyLimit: body.dailyLimit ?? 40,
        warmupDailyLimit: body.dailyLimit ?? 40,
        warmupStatus: 'WARMING',
        warmupStage: 0,
        warmupStartedAt: new Date(),
        recommendedDailyLimit: 5,
        warmupAutoEnabled: true,
        warmupProviderPreference: 'random',
        isActive: false,
      },
      update: {
        displayName: body.displayName?.trim() || normalizedEmail,
        trackingDomain: deriveTrackingDomain(normalizedEmail),
        smtpHost: body.smtpHost,
        smtpPort: Number(body.smtpPort),
        smtpPassword: encryptedPassword,
        imapHost: body.imapHost,
        imapPort: Number(body.imapPort),
        imapSecure: body.imapSecure ?? true,
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null,
        mailboxSyncStatus: 'idle',
        mailboxSyncError: null,
        ...(body.dailyLimit !== undefined ? { dailyLimit: Math.max(1, Number(body.dailyLimit)) } : {}),
        ...(body.dailyLimit !== undefined ? { warmupDailyLimit: Math.max(1, Number(body.dailyLimit)) } : {}),
      },
    })

    await prisma.warmupRecipient.upsert({
      where: { email: account.email },
      create: {
        email: account.email,
        name: account.displayName,
        isActive: true,
        isSystem: true,
        mailAccountId: account.id,
      },
      update: {
        name: account.displayName,
        isActive: true,
        isSystem: true,
        mailAccountId: account.id,
      },
    })

    const domain = normalizedEmail.split('@')[1]?.toLowerCase()
    const diagnostics = domain ? await getDomainDiagnostics(domain, 'gmail') : null

    return NextResponse.json({
      success: true,
      id: account.id,
      email: account.email,
      message: 'Gmail IMAP/SMTP account connected successfully!',
      diagnostics,
    })
  } catch (error) {
    console.error('[Gmail Account]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/mail-accounts/gmail?id=xxx — Remove a Gmail account
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  await prisma.mailAccount.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
