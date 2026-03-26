import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import { testZohoConnection } from '@/lib/mailer/zoho'

// POST /api/mail-accounts/zoho — Save a Zoho SMTP account
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      displayName: string
      email: string
      smtpHost: string
      smtpPort: number
      password: string
      dailyLimit?: number
      testOnly?: boolean
    }

    const { displayName, email, smtpHost, smtpPort, password, dailyLimit, testOnly } = body

    // Validate required fields
    if (!email || !smtpHost || !smtpPort || !password) {
      return NextResponse.json({ error: 'Missing required SMTP fields' }, { status: 400 })
    }

    // Always test the connection first
    const test = await testZohoConnection({ host: smtpHost, port: smtpPort, email, password })
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
      where: { email },
      create: {
        type: 'zoho',
        email,
        displayName: displayName || email,
        smtpHost,
        smtpPort,
        smtpPassword: encryptedPassword,
        dailyLimit: dailyLimit ?? 40,
        warmupStatus: 'WARMING',
        warmupStage: 0,
        warmupStartedAt: new Date(),
        recommendedDailyLimit: 5,
        warmupAutoEnabled: true,
        isActive: false,
      },
      update: {
        displayName: displayName || email,
        smtpHost,
        smtpPort,
        smtpPassword: encryptedPassword,
        dailyLimit: dailyLimit ?? 40,
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

    return NextResponse.json({
      success: true,
      id: account.id,
      email: account.email,
      message: 'Zoho account connected successfully!',
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
      smtpHost: true,
      smtpPort: true,
      dailyLimit: true,
      sentToday: true,
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
