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

export type SentMailReplyState = {
  repliedAt: string | null
  replyCount: number
}

function normalizeEmail(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function normalizeSubject(value: string | null | undefined) {
  return (value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^subject:\s*/i, '')
    .toLowerCase()
}

function candidateTime(candidate: Pick<MailboxCandidate | InboundCandidate, 'sentAt' | 'receivedAt' | 'createdAt'>) {
  return candidate.sentAt || candidate.receivedAt || candidate.createdAt
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
  const sentRecords = records.filter((record) => record.sentAt && record.toEmail && record.subject)
  if (sentRecords.length === 0) return new Map<string, SentMailReplyState>()

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

  if (matchedBySentMail.size === 0) return new Map<string, SentMailReplyState>()
  if (mailboxThreadIds.size === 0 && providerThreadIds.size === 0) return new Map<string, SentMailReplyState>()

  const inboundMessages = await prisma.mailboxMessage.findMany({
    where: {
      direction: 'inbound',
      mailAccountId: { in: accountIds },
      OR: [
        ...(mailboxThreadIds.size > 0 ? [{ mailboxThreadId: { in: Array.from(mailboxThreadIds) } }] : []),
        ...(providerThreadIds.size > 0 ? [{ providerThreadId: { in: Array.from(providerThreadIds) } }] : []),
      ],
    },
    select: {
      mailboxThreadId: true,
      providerThreadId: true,
      sentAt: true,
      receivedAt: true,
      createdAt: true,
    },
  })

  const inboundByThread = new Map<string, InboundCandidate[]>()
  for (const inbound of inboundMessages) {
    const keys = [inbound.mailboxThreadId, inbound.providerThreadId].filter(Boolean) as string[]
    for (const key of keys) {
      const list = inboundByThread.get(key) || []
      list.push(inbound)
      inboundByThread.set(key, list)
    }
  }

  const replyStates = new Map<string, SentMailReplyState>()
  for (const record of sentRecords) {
    const match = matchedBySentMail.get(record.id)
    if (!match) continue

    const threadKeys = [match.mailboxThreadId, match.providerThreadId].filter(Boolean) as string[]
    const relevantReplies = threadKeys.flatMap((key) => inboundByThread.get(key) || [])
    const replyTimes = relevantReplies
      .map((reply) => candidateTime(reply))
      .filter((time, index, array) => time.getTime() > record.sentAt.getTime() && array.findIndex((entry) => entry.getTime() === time.getTime()) === index)
      .sort((a, b) => a.getTime() - b.getTime())

    replyStates.set(record.id, {
      repliedAt: replyTimes[0]?.toISOString() || null,
      replyCount: replyTimes.length,
    })
  }

  return replyStates
}
