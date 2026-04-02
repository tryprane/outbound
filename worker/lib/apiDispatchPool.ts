import { prisma } from '~/lib/prisma'
import { evaluateMailAccountGuardrail } from '~/lib/campaignGuardrails'

const RESERVATION_WINDOW_MS = 2 * 60 * 1000

function intervalMsFromDailyLimit(dailyLimit: number) {
  return Math.floor((8 * 60 * 60 * 1000) / Math.max(1, dailyLimit))
}

function reservationExpiry() {
  return new Date(Date.now() + RESERVATION_WINDOW_MS)
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

  const now = Date.now()
  for (const account of accounts) {
    const guardrail = evaluateMailAccountGuardrail(account)
    if (!guardrail.eligible) continue
    if (account.sentToday >= account.dailyLimit) continue
    if (account.lastMailSentAt) {
      const elapsed = now - account.lastMailSentAt.getTime()
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

  const intervalMs = intervalMsFromDailyLimit(dailyMailsPerAccount)
  const now = Date.now()

  for (const assignment of assignments) {
    const account = assignment.mailAccount
    if (!evaluateMailAccountGuardrail(account).eligible) continue
    if (account.sentToday >= dailyMailsPerAccount) continue
    if (account.lastMailSentAt) {
      const elapsed = now - account.lastMailSentAt.getTime()
      if (elapsed < intervalMs) continue
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
