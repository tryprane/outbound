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
          apiDispatchRequest: { select: { id: true, apiKey: { select: { name: true } } } },
          whatsappAccount: { select: { displayName: true, phoneNumber: true } },
        },
      })

        const header = 'id,campaign,sender,toPhone,message,status,sentAt,errorMessage'
        const rows = records.map((r) => {
          const esc = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
          const sender = r.whatsappAccount.phoneNumber || r.whatsappAccount.displayName
          return [
            esc(r.id),
            esc(r.campaign?.name || `API:${r.apiDispatchRequest?.apiKey.name || 'Unknown'}`),
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
            apiDispatchRequest: { select: { id: true, apiKey: { select: { name: true } } } },
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
      limit,
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
    const complaintWhere = {
      ...(campaignId ? { campaignId } : {}),
      ...(mailAccountId ? { mailAccountId } : {}),
      ...(from || to
        ? {
            createdAt: {
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
          apiDispatchRequest: { select: { id: true, apiKey: { select: { name: true } } } },
          mailAccount: { select: { email: true } },
        },
      })
      let openStates = new Map<string, { openedAt: string; lastOpenedAt: string; openCount: number }>()
      try {
        openStates = await loadEmailOpenStates(records.map((r) => r.id))
      } catch (error) {
        console.warn('[Sent CSV]', error)
      }

      const complaintEvents = await prisma.complaintEvent.findMany({
        where: {
          sentMailId: { in: records.map((record) => record.id) },
        },
        select: {
          sentMailId: true,
          createdAt: true,
        },
      })
      const complaintsByMailId = new Map<string, number>()
      for (const complaint of complaintEvents) {
        if (!complaint.sentMailId) continue
        complaintsByMailId.set(complaint.sentMailId, (complaintsByMailId.get(complaint.sentMailId) || 0) + 1)
      }

      const header = 'id,campaign,sender,toEmail,subject,status,sentAt,openedAt,openCount,openStatus,complaints,errorMessage'
      const rows = records.map((r) => {
        const esc = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
        const openState = openStates.get(r.id)
        const openStatus = openState?.openCount ? 'opened' : 'unopened'
        const complaintCount = complaintsByMailId.get(r.id) || 0
        return [
          esc(r.id),
          esc(r.campaign?.name || `API:${r.apiDispatchRequest?.apiKey.name || 'Unknown'}`),
          esc(r.mailAccount.email),
          esc(r.toEmail),
          esc(r.subject),
          esc(r.status),
          esc(r.sentAt.toISOString()),
          esc(openState?.openedAt || ''),
          esc(String(openState?.openCount ?? 0)),
          esc(openStatus),
          esc(String(complaintCount)),
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

    const [logs, total, sentCount, failedCount, bouncedCount, sentIds, complaintCount] = await Promise.all([
      prisma.sentMail.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          campaign: { select: { id: true, name: true } },
          apiDispatchRequest: { select: { id: true, apiKey: { select: { name: true } } } },
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
      prisma.complaintEvent.count({ where: complaintWhere }),
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
    const complaintEvents = await prisma.complaintEvent.findMany({
      where: {
        sentMailId: { in: logs.map((log) => log.id) },
      },
      select: {
        sentMailId: true,
        createdAt: true,
      },
    })
    const complaintsByMailId = new Map<string, { count: number; firstAt: string }>()
    for (const complaint of complaintEvents) {
      if (!complaint.sentMailId) continue
      const current = complaintsByMailId.get(complaint.sentMailId) || {
        count: 0,
        firstAt: complaint.createdAt.toISOString(),
      }
      current.count += 1
      if (complaint.createdAt.toISOString() < current.firstAt) {
        current.firstAt = complaint.createdAt.toISOString()
      }
      complaintsByMailId.set(complaint.sentMailId, current)
    }
    const hydratedLogs = logs.map((log) => {
      const state = openStates.get(log.id)
      const complaintState = complaintsByMailId.get(log.id)
      return {
        ...log,
        openedAt: state?.openedAt || null,
        lastOpenedAt: state?.lastOpenedAt || null,
        openCount: state?.openCount || 0,
        complaintCount: complaintState?.count || 0,
        complainedAt: complaintState?.firstAt || null,
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
      limit,
      counts: {
        sent: sentCount,
        failed: failedCount,
        bounced: bouncedCount,
        complaints: complaintCount,
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

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      sentMailId?: string
      action?: 'mark-bounced' | 'mark-complaint' | 'clear-complaints' | 'clear-complaint-log'
      reason?: string
    }
    const sentMailId = body.sentMailId?.trim()
    const action = body.action
    if (!sentMailId || !action) {
      return NextResponse.json({ error: 'sentMailId and action are required' }, { status: 400 })
    }

    const sentMail = await prisma.sentMail.findUnique({
      where: { id: sentMailId },
      select: {
        id: true,
        campaignId: true,
        mailAccountId: true,
        toEmail: true,
        status: true,
        errorMessage: true,
      },
    })
    if (!sentMail) {
      return NextResponse.json({ error: 'Sent mail not found' }, { status: 404 })
    }

    if (action === 'mark-bounced') {
      const reason = body.reason?.trim() || 'Marked as bounced manually'
      await prisma.$transaction([
        prisma.sentMail.update({
          where: { id: sentMail.id },
          data: {
            status: 'bounced',
            errorMessage: reason,
          },
        }),
        prisma.unsubscribeList.upsert({
          where: { email: sentMail.toEmail.toLowerCase() },
          create: { email: sentMail.toEmail.toLowerCase() },
          update: {},
        }),
      ])
      return NextResponse.json({ success: true, sentMailId, action })
    }

    if (action === 'mark-complaint') {
      const reason = body.reason?.trim() || 'Recipient complaint'
      await prisma.$transaction([
        prisma.complaintEvent.upsert({
          where: {
            sentMailId_reason_source: {
              sentMailId: sentMail.id,
              reason,
              source: 'manual',
            },
          },
          create: {
            sentMailId: sentMail.id,
            campaignId: sentMail.campaignId,
            mailAccountId: sentMail.mailAccountId,
            email: sentMail.toEmail.toLowerCase(),
            reason,
            source: 'manual',
          },
          update: {},
        }),
        prisma.unsubscribeList.upsert({
          where: { email: sentMail.toEmail.toLowerCase() },
          create: { email: sentMail.toEmail.toLowerCase() },
          update: {},
        }),
      ])
      return NextResponse.json({ success: true, sentMailId, action })
    }

    await prisma.complaintEvent.deleteMany({
      where: {
        sentMailId: sentMail.id,
        source: 'manual',
      },
    })
    return NextResponse.json({
      success: true,
      sentMailId,
      action,
      message: 'Complaint log cleared. Suppression state is unchanged.',
    })
  } catch (error) {
    console.error('[Sent PATCH]', error)
    return NextResponse.json({ error: 'Failed to update sent mail status' }, { status: 500 })
  }
}
