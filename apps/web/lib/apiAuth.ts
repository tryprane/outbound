import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

const API_KEY_PREFIX = 'outbound_live_'

export function hashWorkspaceApiKey(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function createWorkspaceApiKey() {
  const secret = randomBytes(24).toString('hex')
  const value = `${API_KEY_PREFIX}${secret}`
  return {
    value,
    prefix: value.slice(0, 20),
    hash: hashWorkspaceApiKey(value),
  }
}

export async function authenticateWorkspaceApiKey(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) {
    return null
  }

  const hashed = hashWorkspaceApiKey(token)
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hashed },
    select: {
      id: true,
      name: true,
      isActive: true,
      revokedAt: true,
    },
  })

  if (!apiKey || !apiKey.isActive || apiKey.revokedAt) {
    return null
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  })

  return apiKey
}
