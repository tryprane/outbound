import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { loadEmailOpenStates } from '@/lib/emailOpenTracking'

export const dynamic = 'force-dynamic'

type Channel = 'email' | 'whatsapp'

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

async function inferChannel(campaignId?: string): Promise<Channel> {
  if (!campaignId) return 'email'
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { channel: true },
  })
  return campaign?.channel === 'WHATSAPP' ? 'whatsapp' : 'email'
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const campaignId = sp.get('campaignId') || undefined
    const mailAccountId = sp.get('mailAccountId') || undefined
    const whatsappAccountId = sp.get('whatsappAccountId') || undefined
    const status = sp.get('status') || undefined
    const from = parseDate(sp.get('from'))
    const to = parseDate(sp.get('to'))
    const exportCsv = sp.get('export') === 'csv'
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '50', 10)))
    const requestedChannel = sp.get('channel')
    const channel: Channel =
      requestedChannel === 'email' || requestedChannel === 'whatsapp'
        ? requestedChannel
        : await inferChannel(campaignId)

    if (channel === 'whatsapp') {
      const where = {
        ...(campaignId ? { campaignId } : {}),
        ...(whatsappAccountId ? { whatsappAccountId } : {}),
        ...(status ? { status } : {}),
        ...(from || to
          ? {
              sentAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      }

      if (exportCsv) {
        const records = await prisma.sentWhatsAppMessage.findMany({
          where,
          orderBy: { sentAt: 'desc' },
          include: {
            campaign: { select: { name: true } },
            whatsappAccount: { select: { displayName: true, phoneNumber: true } },
          },
        })

        const header = 'id,campaign,sender,toPhone,message,status,sentAt,errorMessage'
        const rows = records.map((r) => {
          const esc = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
          const sender = r.whatsappAccount.phoneNumber || r.whatsappAccount.displayName
          return [
            esc(r.id),
            esc(r.campaign.name),
            esc(sender),
            esc(r.toPhone),
            esc(r.message),
            esc(r.status),
            esc(r.sentAt.toISOString()),
            esc(r.errorMessage),
          ].join(',')
        })

        const csv = [header, ...rows].join('\n')
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="sent-whatsapp-${Date.now()}.csv"`,
          },
        })
      }

      const [logs, total, sentCount, failedCount] = await Promise.all([
        prisma.sentWhatsAppMessage.findMany({
          where,
          orderBy: { sentAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            campaign: { select: { id: true, name: true } },
            whatsappAccount: { select: { id: true, displayName: true, phoneNumber: true } },
          },
        }),
        prisma.sentWhatsAppMessage.count({ where }),
        prisma.sentWhatsAppMessage.count({ where: { ...where, status: 'sent' } }),
        prisma.sentWhatsAppMessage.count({ where: { ...where, status: 'failed' } }),
      ])

      return NextResponse.json({
        channel,
        logs,
        total,
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
        counts: { sent: sentCount, failed: failedCount, bounced: 0 },
      })
    }

    const where = {
      ...(campaignId ? { campaignId } : {}),
      ...(mailAccountId ? { mailAccountId } : {}),
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            sentAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    }

    if (exportCsv) {
      const records = await prisma.sentMail.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        include: {
          campaign: { select: { name: true } },
          mailAccount: { select: { email: true } },
        },
      })
      let openStates = new Map<string, { openedAt: string; lastOpenedAt: string; openCount: number }>()
      try {
        openStates = await loadEmailOpenStates(records.map((r) => r.id))
      } catch (error) {
        console.warn('[Sent CSV]', error)
      }

      const header = 'id,campaign,sender,toEmail,subject,status,sentAt,openedAt,openCount,openStatus,errorMessage'
      const rows = records.map((r) => {
        const esc = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
        const openState = openStates.get(r.id)
        const openStatus = openState?.openCount ? 'opened' : 'unopened'
        return [
          esc(r.id),
          esc(r.campaign.name),
          esc(r.mailAccount.email),
          esc(r.toEmail),
          esc(r.subject),
          esc(r.status),
          esc(r.sentAt.toISOString()),
          esc(openState?.openedAt || ''),
          esc(String(openState?.openCount ?? 0)),
          esc(openStatus),
          esc(r.errorMessage),
        ].join(',')
      })

      const csv = [header, ...rows].join('\n')
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="sent-mail-${Date.now()}.csv"`,
        },
      })
    }

    const [logs, total, sentCount, failedCount, bouncedCount, sentIds] = await Promise.all([
      prisma.sentMail.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          campaign: { select: { id: true, name: true } },
          mailAccount: { select: { id: true, email: true, displayName: true } },
          toEmail: true,
          subject: true,
          status: true,
          sentAt: true,
          errorMessage: true,
        },
      }),
      prisma.sentMail.count({ where }),
      prisma.sentMail.count({ where: { ...where, status: 'sent' } }),
      prisma.sentMail.count({ where: { ...where, status: 'failed' } }),
      prisma.sentMail.count({ where: { ...where, status: 'bounced' } }),
      prisma.sentMail.findMany({
        where: { ...where, status: 'sent' },
        select: { id: true },
      }),
    ])

    let openStates = new Map<string, { openedAt: string; lastOpenedAt: string; openCount: number }>()
    try {
      openStates = await loadEmailOpenStates([
        ...logs.map((log) => log.id),
        ...sentIds.map((record) => record.id),
      ])
    } catch (error) {
      console.warn('[Sent GET]', error)
    }
    const hydratedLogs = logs.map((log) => {
      const state = openStates.get(log.id)
      return {
        ...log,
        openedAt: state?.openedAt || null,
        lastOpenedAt: state?.lastOpenedAt || null,
        openCount: state?.openCount || 0,
      }
    })
    const openedCount = sentIds.reduce((count, record) => {
      const state = openStates.get(record.id)
      return count + (state?.openCount ? 1 : 0)
    }, 0)

    return NextResponse.json({
      channel,
      logs: hydratedLogs,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      counts: {
        sent: sentCount,
        failed: failedCount,
        bounced: bouncedCount,
        opened: openedCount,
        unopened: Math.max(0, sentCount - openedCount),
        openRate: sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0,
      },
    })
  } catch (error) {
    console.error('[Sent GET]', error)
    return NextResponse.json({ error: 'Failed to fetch sent logs' }, { status: 500 })
  }
}
