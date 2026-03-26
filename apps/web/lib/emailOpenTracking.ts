import { getRedis } from '@/lib/redis'

export interface EmailOpenState {
  openedAt: string
  lastOpenedAt: string
  openCount: number
}

function openKey(mailLogId: string) {
  return `email-open:${mailLogId}`
}

export async function recordEmailOpen(mailLogId: string): Promise<EmailOpenState> {
  const redis = getRedis()
  const key = openKey(mailLogId)
  const now = new Date().toISOString()
  const existing = await redis.hgetall(key)
  const openCount = Number(existing.openCount || 0) + 1
  const openedAt = existing.openedAt || now

  await redis.hset(
    key,
    'openedAt',
    openedAt,
    'lastOpenedAt',
    now,
    'openCount',
    String(openCount)
  )

  return { openedAt, lastOpenedAt: now, openCount }
}

export async function loadEmailOpenStates(mailLogIds: string[]): Promise<Map<string, EmailOpenState>> {
  const redis = getRedis()
  const entries = await Promise.all(
    mailLogIds.map(async (mailLogId) => {
      const state = await redis.hgetall(openKey(mailLogId))
      if (!state.openCount && !state.openedAt && !state.lastOpenedAt) {
        return [mailLogId, null] as const
      }

      return [
        mailLogId,
        {
          openedAt: state.openedAt || '',
          lastOpenedAt: state.lastOpenedAt || state.openedAt || '',
          openCount: Number(state.openCount || 0),
        },
      ] as const
    })
  )

  return new Map(entries.filter((entry): entry is readonly [string, EmailOpenState] => entry[1] !== null))
}
