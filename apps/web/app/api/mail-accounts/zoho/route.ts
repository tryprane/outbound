import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import { testZohoConnection } from '@/lib/mailer/zoho'
import { getDomainDiagnostics } from '@/lib/domainDiagnostics'

function inferZohoImapHost(smtpHost: string): string {
  const normalized = smtpHost.toLowerCase()
  if (normalized.includes('.zoho.in')) return 'imap.zoho.in'
  if (normalized.includes('.zoho.eu')) return 'imap.zoho.eu'
  return 'imap.zoho.com'
}

function deriveTrackingDomain(email: string) {
  const domain = email.split('@')[1]?.trim().toLowerCase()
  return domain ? `track.${domain}` : null
}

// POST /api/mail-accounts/zoho — Save a Zoho SMTP account
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      displayName: string
      email: string
      smtpHost: string
      smtpPort: number
      imapHost?: string
      imapPort?: number
      imapSecure?: boolean
      password: string
      dailyLimit?: number
      trackingDomain?: string
      testOnly?: boolean
    }

    const normalizedEmail = body.email?.trim().toLowerCase()
    const { displayName, smtpHost, smtpPort, imapHost, imapPort, imapSecure, password, dailyLimit, trackingDomain, testOnly } = body
    const resolvedTrackingDomain = trackingDomain?.trim().toLowerCase() || deriveTrackingDomain(normalizedEmail)

    // Validate required fields
    if (!normalizedEmail || !smtpHost || !smtpPort || !password) {
      return NextResponse.json({ error: 'Missing required SMTP fields' }, { status: 400 })
    }

    // Always test the connection first
    const test = await testZohoConnection({ host: smtpHost, port: smtpPort, email: normalizedEmail, password })
    if (!test.success) {
      return NextResponse.json(
        { error: `Connection failed: ${test.error}` },
        { status: 400 }
      )
    }

    // If test-only mode (from the "Test Connection" button), stop here
    if (testOnly) {
      return NextResponse.json({ success: true, message: 'SMTP connection verified!' })
    }

    // Encrypt the password before storing
    const encryptedPassword = encrypt(password)

    // Upsert the account (allow updating existing Zoho accounts)
    const account = await prisma.mailAccount.upsert({
      where: { email: normalizedEmail },
        create: {
          type: 'zoho',
          email: normalizedEmail,
          displayName: displayName || normalizedEmail,
          smtpHost,
          smtpPort,
          zohoMailboxMode: 'imap',
          imapHost: imapHost || inferZohoImapHost(smtpHost),
          imapPort: imapPort ?? 993,
          imapSecure: imapSecure ?? true,
          smtpPassword: encryptedPassword,
          zohoAuthError: null,
          trackingDomain: resolvedTrackingDomain,
          dailyLimit: dailyLimit ?? 40,
          warmupDailyLimit: dailyLimit ?? 40,
        warmupStatus: 'WARMING',
        warmupStage: 0,
        warmupStartedAt: new Date(),
        recommendedDailyLimit: 5,
        warmupAutoEnabled: true,
        warmupProviderPreference: 'random',
        isActive: false,
      },
        update: {
          displayName: displayName || normalizedEmail,
          smtpHost,
          smtpPort,
          zohoMailboxMode: 'imap',
          imapHost: imapHost || inferZohoImapHost(smtpHost),
          imapPort: imapPort ?? 993,
          imapSecure: imapSecure ?? true,
          smtpPassword: encryptedPassword,
          zohoAuthError: null,
          trackingDomain: resolvedTrackingDomain,
          dailyLimit: dailyLimit ?? 40,
          warmupDailyLimit: dailyLimit ?? 40,
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
    const diagnostics = domain ? await getDomainDiagnostics(domain, 'zoho') : null

    return NextResponse.json({
      success: true,
      id: account.id,
      email: account.email,
      message: 'Zoho account connected successfully!',
      diagnostics,
    })
  } catch (error) {
    console.error('[Zoho Account]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/mail-accounts/zoho — List all Zoho accounts
export async function GET() {
  const accounts = await prisma.mailAccount.findMany({
    where: { type: 'zoho' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      displayName: true,
      trackingDomain: true,
      smtpHost: true,
      smtpPort: true,
      zohoMailboxMode: true,
      zohoAuthError: true,
      dailyLimit: true,
      sentToday: true,
      warmupDailyLimit: true,
      warmupSentToday: true,
      isActive: true,
      warmupStatus: true,
      warmupStage: true,
      recommendedDailyLimit: true,
      warmupAutoEnabled: true,
      createdAt: true,
      lastResetAt: true,
    },
  })
  return NextResponse.json(accounts)
}
