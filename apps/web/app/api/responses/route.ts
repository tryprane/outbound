import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildPaginatedResult, parsePaginationParams } from '@/lib/pagination'
import { queueReplyAnalysisJobs } from '@/lib/replyAnalysisQueue'
import { collectTrackedReplyMessageIds } from '@/lib/sentMailReplyTracking'

export const dynamic = 'force-dynamic'

function normalizeSearch(value: string | null) {
  return value?.trim() || ''
}

function normalizeAnalysisStatus(value: string | null) {
  if (!value) return ''
  return ['idle', 'pending', 'complete', 'error'].includes(value) ? value : ''
}

function normalizePriority(value: string | null) {
  if (!value) return ''
  return ['high', 'medium', 'low'].includes(value) ? value : ''
}

function normalizeShouldReply(value: string | null) {
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const pagination = parsePaginationParams(request, { defaultLimit: 20, maxLimit: 100 })
    const mailAccountId = searchParams.get('mailAccountId') || undefined
    const analysisStatus = normalizeAnalysisStatus(searchParams.get('analysisStatus'))
    const label = searchParams.get('label')?.trim() || undefined
    const priority = normalizePriority(searchParams.get('priority'))
    const shouldReply = normalizeShouldReply(searchParams.get('shouldReply'))
    const search = normalizeSearch(searchParams.get('search'))
    const sentRecords = await prisma.sentMail.findMany({
      where: {
        status: 'sent',
        ...(mailAccountId ? { mailAccountId } : {}),
      },
      select: {
        id: true,
        mailAccountId: true,
        toEmail: true,
        subject: true,
        sentAt: true,
      },
    })
    const trackedReplyIds = await collectTrackedReplyMessageIds(sentRecords)

    if (trackedReplyIds.length === 0) {
      return NextResponse.json({
        ...buildPaginatedResult([], 0, pagination),
        replies: [],
        summary: {
          openedCount: 0,
          analyzedCount: 0,
          pendingCount: 0,
          shouldReplyCount: 0,
          highPriorityCount: 0,
          labelCounts: {},
        },
        filters: {
          accounts: await prisma.mailAccount.findMany({
            orderBy: { email: 'asc' },
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          }),
        },
      })
    }

    const where: Prisma.MailboxMessageWhereInput = {
      id: { in: trackedReplyIds },
      direction: 'inbound',
      isWarmup: false,
      ...(mailAccountId ? { mailAccountId } : {}),
      ...(analysisStatus ? { analysisStatus } : {}),
      ...(label ? { analysisLabel: label } : {}),
      ...(priority ? { analysisPriority: priority } : {}),
      ...(typeof shouldReply === 'boolean' ? { analysisShouldReply: shouldReply } : {}),
      ...(search
        ? {
            OR: [
              { fromEmail: { contains: search, mode: 'insensitive' } },
              { toEmail: { contains: search, mode: 'insensitive' } },
              { subject: { contains: search, mode: 'insensitive' } },
              { snippet: { contains: search, mode: 'insensitive' } },
              { analysisSummary: { contains: search, mode: 'insensitive' } },
              { analysisReason: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const completeWhere: Prisma.MailboxMessageWhereInput = {
      ...where,
      analysisStatus: 'complete',
    }

    const [
      messages,
      total,
      analyzedCount,
      shouldReplyCount,
      highPriorityCount,
      labels,
      pendingAnalysis,
      accounts,
    ] = await Promise.all([
      prisma.mailboxMessage.findMany({
        where,
        orderBy: [{ analyzedAt: 'desc' }, { receivedAt: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.limit,
        select: {
          id: true,
          mailAccountId: true,
          fromEmail: true,
          toEmail: true,
          subject: true,
          snippet: true,
          receivedAt: true,
          openedAt: true,
          analyzedAt: true,
          analysisStatus: true,
          analysisModel: true,
          analysisLabel: true,
          analysisShouldReply: true,
          analysisPriority: true,
          analysisSummary: true,
          analysisReason: true,
          analysisError: true,
          mailAccount: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      }),
      prisma.mailboxMessage.count({ where }),
      prisma.mailboxMessage.count({ where: completeWhere }),
      prisma.mailboxMessage.count({ where: { ...completeWhere, analysisShouldReply: true } }),
      prisma.mailboxMessage.count({ where: { ...completeWhere, analysisPriority: 'high' } }),
      prisma.mailboxMessage.groupBy({
        by: ['analysisLabel'],
        where: completeWhere,
        _count: { analysisLabel: true },
      }),
      prisma.mailboxMessage.findMany({
        where: {
          ...where,
          analysisStatus: { in: ['idle', 'error'] },
        },
        orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
        take: 250,
        select: { id: true },
      }),
      prisma.mailAccount.findMany({
        orderBy: { email: 'asc' },
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      }),
    ])

    const labelCounts = labels.reduce<Record<string, number>>((acc, entry) => {
      const key = entry.analysisLabel || 'unknown'
      acc[key] = entry._count.analysisLabel
      return acc
    }, {})

    const idleReplyIds = pendingAnalysis.map((message) => message.id)

    if (idleReplyIds.length > 0) {
      await queueReplyAnalysisJobs(
        idleReplyIds.map((mailboxMessageId) => ({
          mailboxMessageId,
          reason: 'detected',
        }))
      )
    }

    return NextResponse.json({
      ...buildPaginatedResult(messages, total, pagination),
      replies: messages,
      summary: {
        openedCount: total,
        analyzedCount,
        pendingCount: Math.max(0, total - analyzedCount),
        shouldReplyCount,
        highPriorityCount,
        labelCounts,
      },
      filters: {
        accounts,
      },
    })
  } catch (error) {
    console.error('[Responses GET]', error)
    return NextResponse.json({ error: 'Failed to load response insights' }, { status: 500 })
  }
}
