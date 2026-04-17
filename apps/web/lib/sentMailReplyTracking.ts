import { prisma } from '@/lib/prisma'

type SentMailReplyRecord = {
  id: string
  mailAccountId: string
  toEmail: string
  subject: string
  sentAt: Date
}

type MailboxCandidate = {
  id: string
  mailAccountId: string
  mailboxThreadId: string | null
  providerThreadId: string | null
  toEmail: string | null
  subject: string | null
  sentAt: Date | null
  receivedAt: Date | null
  createdAt: Date
}

type InboundCandidate = {
  mailboxThreadId: string | null
  providerThreadId: string | null
  sentAt: Date | null
  receivedAt: Date | null
  createdAt: Date
}

type RawInboundReply = InboundCandidate & {
  id: string
  mailAccountId: string
  fromEmail: string | null
  subject: string | null
  snippet: string | null
}

export type SentMailReplyState = {
  repliedAt: string | null
  replyCount: number
}

export type SentMailReplyMessage = {
  id: string
  fromEmail: string | null
  subject: string | null
  snippet: string | null
  sentAt: string | null
  receivedAt: string | null
  createdAt: string
}

export type SentMailReplyDetail = SentMailReplyState & {
  replies: SentMailReplyMessage[]
}

function normalizeEmail(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function normalizeSubject(value: string | null | undefined) {
  return (value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^subject:\s*/i, '')
    .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, '')
    .toLowerCase()
}

function subjectsLookRelated(expected: string | null | undefined, actual: string | null | undefined) {
  const normalizedExpected = normalizeSubject(expected)
  const normalizedActual = normalizeSubject(actual)
  if (!normalizedExpected || !normalizedActual) return false

  return (
    normalizedExpected === normalizedActual ||
    normalizedExpected.includes(normalizedActual) ||
    normalizedActual.includes(normalizedExpected)
  )
}

function candidateTime(candidate: Pick<MailboxCandidate | InboundCandidate, 'sentAt' | 'receivedAt' | 'createdAt'>) {
  return candidate.sentAt || candidate.receivedAt || candidate.createdAt
}

function uniqueReplyKey(reply: RawInboundReply) {
  return [
    reply.id,
    reply.sentAt?.toISOString() || '',
    reply.receivedAt?.toISOString() || '',
    reply.createdAt.toISOString(),
  ].join(':')
}

function chooseBestCandidate(record: SentMailReplyRecord, candidates: MailboxCandidate[]) {
  const expectedEmail = normalizeEmail(record.toEmail)
  const expectedSubject = normalizeSubject(record.subject)
  const sentAtMs = record.sentAt.getTime()
  let best: { candidate: MailboxCandidate; score: number } | null = null

  for (const candidate of candidates) {
    if (normalizeEmail(candidate.toEmail) !== expectedEmail) continue

    const subject = normalizeSubject(candidate.subject)
    const time = candidateTime(candidate)
    const diffMs = Math.abs(time.getTime() - sentAtMs)
    if (diffMs > 36 * 60 * 60 * 1000) continue

    let score = 0
    if (subject === expectedSubject) score += 200
    else if (subject && expectedSubject && (subject.includes(expectedSubject) || expectedSubject.includes(subject))) score += 120
    score -= Math.round(diffMs / 60_000)

    if (!best || score > best.score) {
      best = { candidate, score }
    }
  }

  return best?.candidate || null
}

export async function loadSentMailReplyStates(records: SentMailReplyRecord[]) {
  const details = await loadSentMailReplyDetails(records)
  return new Map(
    Array.from(details.entries()).map(([id, detail]) => [
      id,
      {
        repliedAt: detail.repliedAt,
        replyCount: detail.replyCount,
      },
    ])
  )
}

export async function loadSentMailReplyDetails(records: SentMailReplyRecord[]) {
  const sentRecords = records.filter((record) => record.sentAt && record.toEmail && record.subject)
  if (sentRecords.length === 0) return new Map<string, SentMailReplyDetail>()

  const accountIds = Array.from(new Set(sentRecords.map((record) => record.mailAccountId)))
  const recipientEmails = Array.from(new Set(sentRecords.map((record) => normalizeEmail(record.toEmail)).filter(Boolean)))
  const sentTimes = sentRecords.map((record) => record.sentAt.getTime())
  const windowStart = new Date(Math.min(...sentTimes) - 2 * 24 * 60 * 60 * 1000)
  const windowEnd = new Date(Math.max(...sentTimes) + 14 * 24 * 60 * 60 * 1000)

  const outboundMessages = await prisma.mailboxMessage.findMany({
    where: {
      mailAccountId: { in: accountIds },
      direction: 'outbound',
      toEmail: { in: recipientEmails },
      OR: [
        { sentAt: { gte: windowStart, lte: windowEnd } },
        { receivedAt: { gte: windowStart, lte: windowEnd } },
        { createdAt: { gte: windowStart, lte: windowEnd } },
      ],
    },
    select: {
      id: true,
      mailAccountId: true,
      mailboxThreadId: true,
      providerThreadId: true,
      toEmail: true,
      subject: true,
      sentAt: true,
      receivedAt: true,
      createdAt: true,
    },
  })

  const outboundByAccount = new Map<string, MailboxCandidate[]>()
  for (const message of outboundMessages) {
    const list = outboundByAccount.get(message.mailAccountId) || []
    list.push(message)
    outboundByAccount.set(message.mailAccountId, list)
  }

  const matchedBySentMail = new Map<string, MailboxCandidate>()
  const mailboxThreadIds = new Set<string>()
  const providerThreadIds = new Set<string>()

  for (const record of sentRecords) {
    const match = chooseBestCandidate(record, outboundByAccount.get(record.mailAccountId) || [])
    if (!match) continue
    matchedBySentMail.set(record.id, match)
    if (match.mailboxThreadId) mailboxThreadIds.add(match.mailboxThreadId)
    if (match.providerThreadId) providerThreadIds.add(match.providerThreadId)
  }

  const inboundMessages = await prisma.mailboxMessage.findMany({
    where: {
      direction: 'inbound',
      mailAccountId: { in: accountIds },
      ...(mailboxThreadIds.size > 0 || providerThreadIds.size > 0 || recipientEmails.length > 0
        ? {
            OR: [
              ...(mailboxThreadIds.size > 0 ? [{ mailboxThreadId: { in: Array.from(mailboxThreadIds) } }] : []),
              ...(providerThreadIds.size > 0 ? [{ providerThreadId: { in: Array.from(providerThreadIds) } }] : []),
              ...(recipientEmails.length > 0 ? [{ fromEmail: { in: recipientEmails } }] : []),
            ],
          }
        : {}),
      AND: [
        {
          OR: [
            { sentAt: { gte: windowStart, lte: windowEnd } },
            { receivedAt: { gte: windowStart, lte: windowEnd } },
            { createdAt: { gte: windowStart, lte: windowEnd } },
          ],
        },
      ],
    },
    select: {
      id: true,
      mailAccountId: true,
      mailboxThreadId: true,
      providerThreadId: true,
      fromEmail: true,
      subject: true,
      snippet: true,
      sentAt: true,
      receivedAt: true,
      createdAt: true,
    },
  })

  const inboundByThread = new Map<string, RawInboundReply[]>()
  const inboundByAccountAndSender = new Map<string, RawInboundReply[]>()
  for (const inbound of inboundMessages) {
    const keys = [inbound.mailboxThreadId, inbound.providerThreadId].filter(Boolean) as string[]
    for (const key of keys) {
      const list = inboundByThread.get(key) || []
      list.push(inbound)
      inboundByThread.set(key, list)
    }

    const senderKey = `${inbound.mailAccountId}:${normalizeEmail(inbound.fromEmail)}`
    const senderList = inboundByAccountAndSender.get(senderKey) || []
    senderList.push(inbound)
    inboundByAccountAndSender.set(senderKey, senderList)
  }

  const replyStates = new Map<string, SentMailReplyDetail>()
  for (const record of sentRecords) {
    const match = matchedBySentMail.get(record.id)

    const threadKeys = match ? ([match.mailboxThreadId, match.providerThreadId].filter(Boolean) as string[]) : []
    const threadedReplies = threadKeys
      .flatMap((key) => inboundByThread.get(key) || [])
      .filter((reply) => candidateTime(reply).getTime() > record.sentAt.getTime())
    const fallbackReplies = (inboundByAccountAndSender.get(`${record.mailAccountId}:${normalizeEmail(record.toEmail)}`) || [])
      .filter((reply) => candidateTime(reply).getTime() > record.sentAt.getTime())
      .filter((reply) => subjectsLookRelated(record.subject, reply.subject))
    const relevantReplies = (threadedReplies.length > 0 ? threadedReplies : fallbackReplies)
      .sort((a, b) => candidateTime(a).getTime() - candidateTime(b).getTime())

    const seenReplies = new Set<string>()
    const replies = relevantReplies.filter((reply) => {
      const key = uniqueReplyKey(reply)
      if (seenReplies.has(key)) return false
      seenReplies.add(key)
      return true
    })

    replyStates.set(record.id, {
      repliedAt: replies[0] ? candidateTime(replies[0]).toISOString() : null,
      replyCount: replies.length,
      replies: replies.map((reply) => ({
        id: reply.id,
        fromEmail: reply.fromEmail,
        subject: reply.subject,
        snippet: reply.snippet,
        sentAt: reply.sentAt?.toISOString() || null,
        receivedAt: reply.receivedAt?.toISOString() || null,
        createdAt: reply.createdAt.toISOString(),
      })),
    })
  }

  return replyStates
}
