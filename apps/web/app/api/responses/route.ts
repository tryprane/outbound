import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildPaginatedResult, parsePaginationParams } from '@/lib/pagination'
import { queueReplyAnalysisJobs } from '@/lib/replyAnalysisQueue'

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

    const where: Prisma.MailboxMessageWhereInput = {
      direction: 'inbound',
      isWarmup: false,
      openedAt: { not: null },
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
      accounts,
    ] = await Promise.all([
      prisma.mailboxMessage.findMany({
        where,
        orderBy: [{ analyzedAt: 'desc' }, { openedAt: 'desc' }, { receivedAt: 'desc' }, { createdAt: 'desc' }],
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

    const idleReplyIds = messages
      .filter((message) => message.analysisStatus === 'idle')
      .map((message) => message.id)

    if (idleReplyIds.length > 0) {
      await queueReplyAnalysisJobs(
        idleReplyIds.map((mailboxMessageId) => ({
          mailboxMessageId,
          reason: 'opened',
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
