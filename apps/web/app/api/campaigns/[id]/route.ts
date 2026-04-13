import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { loadEmailOpenStates } from '@/lib/emailOpenTracking'
import { evaluateMailAccountGuardrail } from '@/lib/campaignGuardrails'
import { loadSentMailReplyStates } from '@/lib/sentMailReplyTracking'

function nextMidnight(from: Date): Date {
  const d = new Date(from)
  d.setHours(24, 0, 0, 0)
  return d
}

type ScheduleAccountState = {
  mailAccountId: string
  email: string
  displayName: string
  type: string
  dailyLimit: number
  nextAvailableAt: Date
  plannedToday: number
}

type UpcomingSlot = {
  position: number
  scheduledAt: string
  mailAccountId: string
  senderEmail: string
  senderDisplayName: string
  senderType: string
}

type UpcomingSchedule = {
  nextRunAt: string | null
  slots: UpcomingSlot[]
}

function buildUpcomingSchedule(
  states: ScheduleAccountState[],
  dailyMailsPerAccount: number,
  slotsRequested: number
): UpcomingSchedule {
  if (states.length === 0 || slotsRequested <= 0) {
    return { nextRunAt: null, slots: [] }
  }

  const slots: UpcomingSlot[] = []

  for (let i = 0; i < slotsRequested; i++) {
    for (const state of states) {
      const effectiveDailyLimit = Math.min(dailyMailsPerAccount, state.dailyLimit)
      while (state.plannedToday >= effectiveDailyLimit) {
        state.nextAvailableAt = nextMidnight(state.nextAvailableAt)
        state.plannedToday = 0
      }
    }

    states.sort((a, b) => {
      const timeDiff = a.nextAvailableAt.getTime() - b.nextAvailableAt.getTime()
      if (timeDiff !== 0) return timeDiff
      return a.plannedToday - b.plannedToday
    })

    const chosen = states[0]
    const effectiveDailyLimit = Math.min(dailyMailsPerAccount, chosen.dailyLimit)
    const intervalMs = Math.max(60_000, Math.floor((8 * 60 * 60 * 1000) / Math.max(1, effectiveDailyLimit)))
    const slotTime = new Date(chosen.nextAvailableAt)

    slots.push({
      position: i + 1,
      scheduledAt: slotTime.toISOString(),
      mailAccountId: chosen.mailAccountId,
      senderEmail: chosen.email,
      senderDisplayName: chosen.displayName,
      senderType: chosen.type,
    })

    chosen.plannedToday += 1
    chosen.nextAvailableAt = new Date(slotTime.getTime() + intervalMs)
  }

  return {
    nextRunAt: slots[0]?.scheduledAt ?? null,
    slots,
  }
}

// GET /api/campaigns/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        csvFile: {
          select: {
            id: true, originalName: true, rowCount: true, columnMap: true,
          },
        },
        mailAccounts: {
          include: {
            mailAccount: {
              select: {
                id: true, email: true, type: true, displayName: true,
                dailyLimit: true, sentToday: true, isActive: true, lastMailSentAt: true, warmupStatus: true,
                mailboxHealthStatus: true, mailboxHealthScore: true, mailboxSyncStatus: true,
              },
            },
          },
        },
        whatsappAccounts: {
          include: {
            whatsappAccount: {
              select: {
                id: true,
                displayName: true,
                phoneNumber: true,
                isActive: true,
                connectionStatus: true,
                dailyLimit: true,
                sentToday: true,
                lastMessageSentAt: true,
              },
            },
          },
        },
        _count: { select: { sentMails: true, sentWhatsAppMessages: true } },
      },
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Calculate progress
    const csvRowCount = campaign.csvFile.rowCount
    const progress = csvRowCount > 0
      ? Math.round((campaign.currentRowIndex / csvRowCount) * 100)
      : 0

    const now = new Date()
    const rowsRemaining = Math.max(0, csvRowCount - campaign.currentRowIndex)
    const scheduleSize = Math.min(rowsRemaining, 50)

    const scheduleStates: ScheduleAccountState[] =
      campaign.channel === 'WHATSAPP'
        ? campaign.whatsappAccounts
            .map((assignment) => assignment.whatsappAccount)
            .filter((account) => account.isActive && account.connectionStatus === 'CONNECTED')
            .map((account) => {
              const effectiveDailyLimit = Math.min(campaign.dailyMailsPerAccount, account.dailyLimit)
              const intervalMs = Math.max(60_000, Math.floor((8 * 60 * 60 * 1000) / Math.max(1, effectiveDailyLimit)))
              const nextByInterval = account.lastMessageSentAt
                ? new Date(account.lastMessageSentAt.getTime() + intervalMs)
                : now

              return {
                mailAccountId: account.id,
                email: account.phoneNumber || account.displayName,
                displayName: account.displayName,
                type: 'whatsapp',
                dailyLimit: account.dailyLimit,
                nextAvailableAt: nextByInterval > now ? nextByInterval : now,
                plannedToday: account.sentToday,
              }
            })
        : campaign.mailAccounts
            .map((assignment) => assignment.mailAccount)
            .filter((account) => evaluateMailAccountGuardrail(account).eligible)
            .map((account) => {
              const effectiveDailyLimit = Math.min(campaign.dailyMailsPerAccount, account.dailyLimit)
              const intervalMs = Math.max(60_000, Math.floor((8 * 60 * 60 * 1000) / Math.max(1, effectiveDailyLimit)))
              const nextByInterval = account.lastMailSentAt
                ? new Date(account.lastMailSentAt.getTime() + intervalMs)
                : now

              return {
                mailAccountId: account.id,
                email: account.email,
                displayName: account.displayName,
                type: account.type,
                dailyLimit: account.dailyLimit,
                nextAvailableAt: nextByInterval > now ? nextByInterval : now,
                plannedToday: account.sentToday,
              }
            })

    const upcomingSchedule = buildUpcomingSchedule(
      scheduleStates,
      campaign.dailyMailsPerAccount,
      scheduleSize
    )

    const recentSent =
      campaign.channel === 'WHATSAPP'
        ? await prisma.sentWhatsAppMessage.findMany({
            where: { campaignId: params.id },
            orderBy: { sentAt: 'desc' },
            take: 20,
            select: {
              id: true,
              toPhone: true,
              message: true,
              status: true,
              sentAt: true,
              errorMessage: true,
              whatsappAccount: {
                select: { id: true, displayName: true, phoneNumber: true },
              },
            },
          })
        : await prisma.sentMail.findMany({
            where: { campaignId: params.id },
            orderBy: { sentAt: 'desc' },
            take: 20,
            select: {
              id: true,
              toEmail: true,
              subject: true,
              status: true,
              sentAt: true,
              errorMessage: true,
              mailAccount: {
                select: { id: true, email: true, displayName: true, type: true },
              },
            },
          })

    const emailSentIds =
      campaign.channel === 'EMAIL'
        ? await prisma.sentMail.findMany({
            where: { campaignId: params.id, status: 'sent' },
            select: {
              id: true,
              mailAccountId: true,
              toEmail: true,
              subject: true,
              sentAt: true,
            },
          })
        : []
    let openStates = new Map<string, { openedAt: string; lastOpenedAt: string; openCount: number }>()
    try {
      openStates = await loadEmailOpenStates([
        ...recentSent.map((log) => log.id),
        ...emailSentIds.map((record) => record.id),
      ])
    } catch (error) {
      console.warn('[Campaign GET]', error)
    }
    const replyStates = campaign.channel === 'EMAIL' ? await loadSentMailReplyStates(emailSentIds) : new Map()
    const hydratedRecentSent =
      campaign.channel === 'EMAIL'
        ? recentSent.map((log) => {
            const state = openStates.get(log.id)
            const replyState = replyStates.get(log.id)
            return {
              ...log,
              openedAt: state?.openedAt || null,
              lastOpenedAt: state?.lastOpenedAt || null,
              openCount: state?.openCount || 0,
              repliedAt: replyState?.repliedAt || null,
              replyCount: replyState?.replyCount || 0,
            }
          })
        : recentSent

    const emailOpenStats =
      campaign.channel === 'EMAIL'
        ? (() => {
            const sent = emailSentIds.length
            const opened = emailSentIds.reduce((count, record) => {
              const state = openStates.get(record.id)
              return count + (state?.openCount ? 1 : 0)
            }, 0)
            const replied = emailSentIds.reduce((count, record) => {
              const state = replyStates.get(record.id)
              return count + (state?.repliedAt ? 1 : 0)
            }, 0)
            return {
              sent,
              opened,
              unopened: Math.max(0, sent - opened),
              openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
              replied,
              unreplied: Math.max(0, sent - replied),
              replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
            }
          })()
        : null

    return NextResponse.json({ ...campaign, progress, upcomingSchedule, recentSent: hydratedRecentSent, emailOpenStats })
  } catch (error) {
    console.error('[Campaign GET]', error)
    return NextResponse.json({ error: 'Failed to fetch campaign' }, { status: 500 })
  }
}

// PATCH /api/campaigns/[id] — Update draft settings
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { name, prompt, dailyMailsPerAccount, scrapeEmail, scrapeWhatsapp } = body

    const updated = await prisma.campaign.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(prompt !== undefined && { prompt }),
        ...(dailyMailsPerAccount !== undefined && { dailyMailsPerAccount }),
        ...(scrapeEmail !== undefined && { scrapeEmail }),
        ...(scrapeWhatsapp !== undefined && { scrapeWhatsapp }),
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[Campaign PATCH]', error)
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }
}

// DELETE /api/campaigns/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.campaign.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Campaign DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }
}
