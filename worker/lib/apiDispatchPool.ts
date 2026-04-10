import { prisma } from '~/lib/prisma'
import { evaluateMailAccountGuardrail } from '~/lib/campaignGuardrails'

const RESERVATION_WINDOW_MS = 2 * 60 * 1000

type MailAccountSendState = {
  sentToday: number
  lastSentAt: Date | null
}

function intervalMsFromDailyLimit(dailyLimit: number) {
  return Math.floor((8 * 60 * 60 * 1000) / Math.max(1, dailyLimit))
}

function reservationExpiry() {
  return new Date(Date.now() + RESERVATION_WINDOW_MS)
}

function startOfToday() {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

async function getMailAccountSendState(accountIds: string[]) {
  if (accountIds.length === 0) {
    return new Map<string, MailAccountSendState>()
  }

  const [accounts, todayCounts, latestSends] = await Promise.all([
    prisma.mailAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, sentToday: true, lastMailSentAt: true },
    }),
    prisma.sentMail.groupBy({
      by: ['mailAccountId'],
      where: {
        mailAccountId: { in: accountIds },
        sentAt: { gte: startOfToday() },
      },
      _count: { _all: true },
    }),
    prisma.sentMail.groupBy({
      by: ['mailAccountId'],
      where: {
        mailAccountId: { in: accountIds },
      },
      _max: { sentAt: true },
    }),
  ])

  const state = new Map<string, MailAccountSendState>()
  for (const accountId of accountIds) {
    state.set(accountId, { sentToday: 0, lastSentAt: null })
  }

  for (const account of accounts) {
    state.set(account.id, {
      sentToday: account.sentToday,
      lastSentAt: account.lastMailSentAt,
    })
  }

  for (const row of todayCounts) {
    const current = state.get(row.mailAccountId) ?? { sentToday: 0, lastSentAt: null }
    state.set(row.mailAccountId, {
      sentToday: Math.max(current.sentToday, row._count._all),
      lastSentAt: current.lastSentAt,
    })
  }

  for (const row of latestSends) {
    const current = state.get(row.mailAccountId) ?? { sentToday: 0, lastSentAt: null }
    const latestSentMailAt = row._max.sentAt ?? null
    const lastSentAt =
      current.lastSentAt && latestSentMailAt
        ? current.lastSentAt > latestSentMailAt
          ? current.lastSentAt
          : latestSentMailAt
        : current.lastSentAt ?? latestSentMailAt

    state.set(row.mailAccountId, {
      sentToday: current.sentToday,
      lastSentAt,
    })
  }

  return state
}

async function claimMailAccountReservation(accountId: string, reservationKey: string) {
  const now = new Date()
  const claimed = await prisma.mailAccount.updateMany({
    where: {
      id: accountId,
      OR: [
        { apiReservedUntil: null },
        { apiReservedUntil: { lt: now } },
      ],
    },
    data: {
      apiReservationKey: reservationKey,
      apiReservedUntil: reservationExpiry(),
    },
  })

  return claimed.count === 1
}

async function claimWhatsAppAccountReservation(accountId: string, reservationKey: string) {
  const now = new Date()
  const claimed = await prisma.whatsAppAccount.updateMany({
    where: {
      id: accountId,
      OR: [
        { apiReservedUntil: null },
        { apiReservedUntil: { lt: now } },
      ],
    },
    data: {
      apiReservationKey: reservationKey,
      apiReservedUntil: reservationExpiry(),
    },
  })

  return claimed.count === 1
}

export async function releaseMailAccountReservation(mailAccountId: string, reservationKey?: string | null) {
  if (!reservationKey) return
  await prisma.mailAccount.updateMany({
    where: {
      id: mailAccountId,
      apiReservationKey: reservationKey,
    },
    data: {
      apiReservationKey: null,
      apiReservedUntil: null,
    },
  })
}

export async function releaseWhatsAppAccountReservation(whatsappAccountId: string, reservationKey?: string | null) {
  if (!reservationKey) return
  await prisma.whatsAppAccount.updateMany({
    where: {
      id: whatsappAccountId,
      apiReservationKey: reservationKey,
    },
    data: {
      apiReservationKey: null,
      apiReservedUntil: null,
    },
  })
}

export async function pickNextPooledMailAccount(reservationKey: string) {
  const accounts = await prisma.mailAccount.findMany({
    orderBy: [
      { lastMailSentAt: 'asc' },
      { createdAt: 'asc' },
    ],
  })
  const sendState = await getMailAccountSendState(accounts.map((account) => account.id))

  const now = Date.now()
  for (const account of accounts) {
    const guardrail = evaluateMailAccountGuardrail(account)
    if (!guardrail.eligible) continue
    const accountSendState = sendState.get(account.id) ?? { sentToday: 0, lastSentAt: null }
    if (accountSendState.sentToday >= account.dailyLimit) continue
    if (accountSendState.lastSentAt) {
      const elapsed = now - accountSendState.lastSentAt.getTime()
      if (elapsed < intervalMsFromDailyLimit(account.dailyLimit)) continue
    }
    const claimed = await claimMailAccountReservation(account.id, reservationKey)
    if (claimed) return account
  }

  return null
}

export async function pickNextPooledWhatsAppAccount(reservationKey: string) {
  const accounts = await prisma.whatsAppAccount.findMany({
    orderBy: [
      { lastMessageSentAt: 'asc' },
      { createdAt: 'asc' },
    ],
  })

  const now = Date.now()
  for (const account of accounts) {
    if (!account.isActive || account.connectionStatus !== 'CONNECTED') continue
    if (account.sentToday >= account.dailyLimit) continue
    if (account.lastMessageSentAt) {
      const elapsed = now - account.lastMessageSentAt.getTime()
      if (elapsed < intervalMsFromDailyLimit(account.dailyLimit)) continue
    }
    const claimed = await claimWhatsAppAccountReservation(account.id, reservationKey)
    if (claimed) return account
  }

  return null
}

export async function pickReservedCampaignMailAccount(
  campaignId: string,
  dailyMailsPerAccount: number,
  reservationKey: string
) {
  const assignments = await prisma.campaignMailAccount.findMany({
    where: { campaignId },
    include: { mailAccount: true },
    orderBy: { lastSentAt: 'asc' },
  })
  const sendState = await getMailAccountSendState(assignments.map((assignment) => assignment.mailAccount.id))

  const now = Date.now()

  for (const assignment of assignments) {
    const account = assignment.mailAccount
    if (!evaluateMailAccountGuardrail(account).eligible) continue
    const effectiveDailyLimit = Math.min(dailyMailsPerAccount, account.dailyLimit)
    const accountSendState = sendState.get(account.id) ?? { sentToday: 0, lastSentAt: null }
    if (accountSendState.sentToday >= effectiveDailyLimit) continue
    if (accountSendState.lastSentAt) {
      const elapsed = now - accountSendState.lastSentAt.getTime()
      if (elapsed < intervalMsFromDailyLimit(effectiveDailyLimit)) continue
    }
    const claimed = await claimMailAccountReservation(account.id, reservationKey)
    if (claimed) return account
  }

  return null
}

export async function pickReservedCampaignWhatsAppAccount(
  campaignId: string,
  dailyLimit: number,
  reservationKey: string
) {
  const assignments = await prisma.campaignWhatsAppAccount.findMany({
    where: { campaignId },
    include: { whatsappAccount: true },
    orderBy: { lastSentAt: 'asc' },
  })

  const intervalMs = intervalMsFromDailyLimit(dailyLimit)
  const now = Date.now()

  for (const assignment of assignments) {
    const account = assignment.whatsappAccount
    if (!account.isActive || account.connectionStatus !== 'CONNECTED') continue
    if (account.sentToday >= dailyLimit) continue
    if (account.lastMessageSentAt) {
      const elapsed = now - account.lastMessageSentAt.getTime()
      if (elapsed < intervalMs) continue
    }
    const claimed = await claimWhatsAppAccountReservation(account.id, reservationKey)
    if (claimed) return account
  }

  return null
}
