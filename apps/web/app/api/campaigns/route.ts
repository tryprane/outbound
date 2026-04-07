import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildPaginatedResult, parsePaginationParams } from '@/lib/pagination'
import { z } from 'zod'
import { evaluateMailAccountGuardrail } from '@/lib/campaignGuardrails'
import { getDomainDiagnostics, getDomainDiagnosticsBlockers } from '@/lib/domainDiagnostics'

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
    const pagination = parsePaginationParams(request, { defaultLimit: 12, maxLimit: 100 })
    const where = status ? { status } : undefined

    const [items, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
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
      }),
      prisma.campaign.count({ where }),
    ])

    return NextResponse.json(buildPaginatedResult(items, total, pagination))
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
        select: {
          id: true,
          email: true,
          type: true,
          isActive: true,
          warmupStatus: true,
          mailboxHealthStatus: true,
          mailboxHealthScore: true,
          mailboxSyncStatus: true,
        },
      })
      if (selectedAccounts.length !== mailAccountIds.length) {
        return NextResponse.json({ error: 'One or more selected mail accounts were not found.' }, { status: 400 })
      }
      const nonEligible = selectedAccounts
        .map((acc) => ({ account: acc, result: evaluateMailAccountGuardrail(acc) }))
        .filter((entry) => !entry.result.eligible)
      if (nonEligible.length > 0) {
        const emails = nonEligible
          .map(({ account, result }) => `${account.email} (${result.reason})`)
          .join(', ')
        return NextResponse.json(
          { error: `Only healthy, synced, ACTIVE + WARMED mailboxes can be used. Fix: ${emails}` },
          { status: 400 }
        )
      }
      const diagnostics = await Promise.all(
        selectedAccounts.map(async (account) => {
          const domain = account.email.split('@')[1]?.toLowerCase()
          if (!domain) return null
          const providerHint = account.type === 'gmail' || account.type === 'zoho' ? account.type : 'unknown'
          const result = await getDomainDiagnostics(domain, providerHint)
          return { email: account.email, result }
        })
      )
      const criticalDomains = diagnostics
        .filter((item): item is { email: string; result: Awaited<ReturnType<typeof getDomainDiagnostics>> } => Boolean(item))
        .map(({ email, result }) => ({ email, blockers: getDomainDiagnosticsBlockers(result) }))
        .filter((item) => item.blockers.length > 0)
      if (criticalDomains.length > 0) {
        const message = criticalDomains
          .map((item) => `${item.email}: ${item.blockers.join(', ')}`)
          .join(' | ')
        return NextResponse.json(
          { error: `Sender domain safety checks failed. Fix: ${message}` },
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
