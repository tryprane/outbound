import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreateCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  type: z.enum(['indian', 'international']),
  channel: z.enum(['email', 'whatsapp']).default('email'),
  csvFileId: z.string().min(1),
  prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
  whatsappColumn: z.string().optional(),
  scrapeEmail: z.boolean().default(false),
  scrapeWhatsapp: z.boolean().default(false),
  dailyMailsPerAccount: z.number().int().min(1).max(500).default(40),
  mailAccountIds: z.array(z.string()).default([]),
  whatsappAccountIds: z.array(z.string()).default([]),
})

// GET /api/campaigns — List all campaigns
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status')

    const campaigns = await prisma.campaign.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        csvFile: {
          select: { id: true, originalName: true, rowCount: true },
        },
        mailAccounts: {
          include: {
            mailAccount: {
              select: { id: true, email: true, type: true, displayName: true },
            },
          },
        },
        whatsappAccounts: {
          include: {
            whatsappAccount: {
              select: { id: true, displayName: true, phoneNumber: true, isActive: true },
            },
          },
        },
        _count: { select: { sentMails: true, sentWhatsAppMessages: true } },
      },
    })

    return NextResponse.json(campaigns)
  } catch (error) {
    console.error('[Campaigns GET]', error)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }
}

// POST /api/campaigns — Create a new campaign
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = CreateCampaignSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      )
    }

    const {
      name, type, channel, csvFileId, prompt,
      whatsappColumn,
      scrapeEmail, scrapeWhatsapp,
      dailyMailsPerAccount, mailAccountIds, whatsappAccountIds,
    } = parsed.data

    if (channel === 'email') {
      if (mailAccountIds.length === 0) {
        return NextResponse.json({ error: 'Select at least one mail account' }, { status: 400 })
      }
      const selectedAccounts = await prisma.mailAccount.findMany({
        where: { id: { in: mailAccountIds } },
        select: { id: true, email: true, isActive: true, warmupStatus: true },
      })
      if (selectedAccounts.length !== mailAccountIds.length) {
        return NextResponse.json({ error: 'One or more selected mail accounts were not found.' }, { status: 400 })
      }
      const nonEligible = selectedAccounts.filter(
        (acc) => !acc.isActive || acc.warmupStatus !== 'WARMED'
      )
      if (nonEligible.length > 0) {
        const emails = nonEligible.map((a) => a.email).join(', ')
        return NextResponse.json(
          { error: `Only ACTIVE + WARMED mailboxes can be used. Fix: ${emails}` },
          { status: 400 }
        )
      }
    } else {
      if (whatsappAccountIds.length === 0) {
        return NextResponse.json({ error: 'Select at least one WhatsApp account' }, { status: 400 })
      }
      const whatsappAccounts = await prisma.whatsAppAccount.findMany({
        where: { id: { in: whatsappAccountIds } },
        select: { id: true, displayName: true, isActive: true, connectionStatus: true },
      })
      if (whatsappAccounts.length !== whatsappAccountIds.length) {
        return NextResponse.json({ error: 'One or more WhatsApp accounts were not found.' }, { status: 400 })
      }
      const invalid = whatsappAccounts.filter(
        (acc) => !acc.isActive || acc.connectionStatus !== 'CONNECTED'
      )
      if (invalid.length > 0) {
        const names = invalid.map((a) => a.displayName).join(', ')
        return NextResponse.json(
          { error: `Only ACTIVE + CONNECTED WhatsApp accounts can be used. Fix: ${names}` },
          { status: 400 }
        )
      }
      if (!whatsappColumn?.trim()) {
        return NextResponse.json({ error: 'Please map the WhatsApp/mobile column.' }, { status: 400 })
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        type,
        channel: channel === 'whatsapp' ? 'WHATSAPP' : 'EMAIL',
        csvFileId,
        prompt,
        whatsappColumn: channel === 'whatsapp' ? whatsappColumn?.trim() : null,
        scrapeEmail,
        scrapeWhatsapp,
        dailyMailsPerAccount,
        status: 'draft',
        mailAccounts: {
          create: mailAccountIds.map((id) => ({ mailAccountId: id })),
        },
        whatsappAccounts: {
          create: whatsappAccountIds.map((id) => ({ whatsappAccountId: id })),
        },
      },
      include: {
        mailAccounts: true,
        whatsappAccounts: true,
        csvFile: { select: { originalName: true, rowCount: true } },
      },
    })

    return NextResponse.json(campaign, { status: 201 })
  } catch (error) {
    console.error('[Campaign Create]', error)
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}
