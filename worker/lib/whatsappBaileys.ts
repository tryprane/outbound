import * as fs from 'fs'
import * as path from 'path'
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { Prisma } from '@prisma/client'
import { prisma } from '~/lib/prisma'

type SocketMap = Map<string, ReturnType<typeof makeWASocket>>
type WAVersion = [number, number, number]

const sockets: SocketMap = new Map()
const sessionRoot = path.resolve(process.env.WHATSAPP_SESSION_DIR || path.join(process.cwd(), '.baileys-sessions'))
let latestVersionCache: WAVersion | null = null

if (!fs.existsSync(sessionRoot)) {
  fs.mkdirSync(sessionRoot, { recursive: true })
}

function normalizePhone(input: string): string {
  const trimmed = input.trim()
  if (trimmed.endsWith('@s.whatsapp.net')) return trimmed
  const digits = trimmed.replace(/[^\d]/g, '')
  return `${digits}@s.whatsapp.net`
}

function jidToPhone(jid?: string | null) {
  if (!jid) return null
  return jid.replace(/@s\.whatsapp\.net$/i, '')
}

async function upsertManagedConversation(accountId: string, remoteJid: string, data?: {
  participantName?: string | null
  messageId?: string | null
  direction?: 'inbound' | 'outbound'
  body?: string | null
  status?: string | null
  sentAt?: Date | null
  receivedAt?: Date | null
  metadata?: Record<string, unknown>
}) {
  const conversation = await prisma.whatsAppConversation.upsert({
    where: {
      whatsappAccountId_participantJid: {
        whatsappAccountId: accountId,
        participantJid: remoteJid,
      },
    },
    create: {
      whatsappAccountId: accountId,
      participantJid: remoteJid,
      participantPhone: jidToPhone(remoteJid),
      participantName: data?.participantName || null,
      lastMessageAt: data?.receivedAt || data?.sentAt || new Date(),
    },
    update: {
      participantPhone: jidToPhone(remoteJid),
      ...(data?.participantName ? { participantName: data.participantName } : {}),
      lastMessageAt: data?.receivedAt || data?.sentAt || new Date(),
    },
    select: { id: true },
  })

  if (data?.body && data.direction) {
    const providerMessageId = data.messageId || null
    const direction = data.direction
    const body = data.body
    const metadata = data.metadata as Prisma.InputJsonValue | undefined

    await prisma.whatsAppConversationMessage.upsert({
      where: {
        whatsappAccountId_providerMessageId: {
          whatsappAccountId: accountId,
          providerMessageId: providerMessageId || '',
        },
      },
      create: {
        conversationId: conversation.id,
        whatsappAccountId: accountId,
        providerMessageId,
        direction,
        body,
        status: data.status || null,
        sentAt: data.sentAt || null,
        receivedAt: data.receivedAt || null,
        metadata,
      },
      update: {
        conversationId: conversation.id,
        body,
        status: data.status || null,
        sentAt: data.sentAt || null,
        receivedAt: data.receivedAt || null,
        metadata,
      },
    }).catch(async () => {
      await prisma.whatsAppConversationMessage.create({
        data: {
          conversationId: conversation.id,
          whatsappAccountId: accountId,
          providerMessageId,
          direction,
          body,
          status: data.status || null,
          sentAt: data.sentAt || null,
          receivedAt: data.receivedAt || null,
          metadata,
        },
      })
    })
  }

  return conversation
}

async function getSocketVersion() {
  if (latestVersionCache) return latestVersionCache
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`[Baileys] using WA version ${version.join('.')} (isLatest=${isLatest})`)
    latestVersionCache = version as WAVersion
    return version
  } catch (err) {
    console.warn('[Baileys] failed to fetch latest version, falling back to bundled version', err)
    return undefined
  }
}

async function updateWhatsAppAccountSafe(accountId: string, data: Record<string, unknown>) {
  const result = await prisma.whatsAppAccount.updateMany({
    where: { id: accountId },
    data,
  })
  return result.count > 0
}

export async function connectWhatsAppSession(accountId: string, sessionKey: string) {
  const existing = sockets.get(accountId)
  if (existing) return existing

  const authDir = path.join(sessionRoot, sessionKey)
  fs.mkdirSync(authDir, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const version = await getSocketVersion()

  const sock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.windows('OutreachOS'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
  })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('messages.upsert', async (event) => {
    if (event.type !== 'notify') return
    for (const message of event.messages || []) {
      try {
        if (message.key.fromMe) continue
        const remoteJid = message.key.remoteJid
        if (!remoteJid || !remoteJid.endsWith('@s.whatsapp.net')) continue

        const text =
          message.message?.conversation ||
          message.message?.extendedTextMessage?.text ||
          message.message?.imageMessage?.caption ||
          message.message?.videoMessage?.caption ||
          ''
        if (!text.trim()) continue

        await upsertManagedConversation(accountId, remoteJid, {
          participantName: message.pushName || null,
          messageId: message.key.id || null,
          direction: 'inbound',
          body: text.trim(),
          status: 'received',
          receivedAt: message.messageTimestamp ? new Date(Number(message.messageTimestamp) * 1000) : new Date(),
          metadata: {
            pushName: message.pushName || null,
          },
        })
      } catch (err) {
        console.error('[Baileys] failed to persist inbound message', err)
      }
    }
  })
  sock.ev.on('connection.update', async (update) => {
    try {
      if (update.qr) {
        console.log(`[Baileys] QR received for ${accountId}`)
        await updateWhatsAppAccountSafe(accountId, { connectionStatus: 'QR_PENDING', lastQr: update.qr, lastError: null })
      }

      if (update.connection === 'open') {
        await updateWhatsAppAccountSafe(accountId, {
          connectionStatus: 'CONNECTED',
          lastConnectedAt: new Date(),
          lastQr: null,
          lastError: null,
        })
      }

      if (update.connection === 'close') {
        const code = (update.lastDisconnect?.error as Boom)?.output?.statusCode
        const shouldReconnect = code !== DisconnectReason.loggedOut
        await updateWhatsAppAccountSafe(accountId, {
          connectionStatus: shouldReconnect ? 'DISCONNECTED' : 'ERROR',
          lastError: code ? `disconnect:${code}` : 'disconnected',
        })
        sockets.delete(accountId)
        if (shouldReconnect) {
          setTimeout(() => {
            void connectWhatsAppSession(accountId, sessionKey)
          }, 3_000)
        }
      }
    } catch (err) {
      console.error('[Baileys] connection update failed', err)
    }
  })

  sockets.set(accountId, sock)
  return sock
}

export async function resetWhatsAppSession(accountId: string) {
  const existing = sockets.get(accountId)
  if (existing) {
    try {
      existing.end(undefined)
    } catch (err) {
      console.error('[Baileys] failed to close existing socket', err)
    }
    sockets.delete(accountId)
  }
}

export async function clearWhatsAppSessionFiles(sessionKey: string) {
  const authDir = path.join(sessionRoot, sessionKey)
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true })
  }
}

export async function initAllWhatsAppSessions() {
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { isActive: true },
    select: { id: true, sessionKey: true },
  })
  for (const acc of accounts) {
    try {
      await connectWhatsAppSession(acc.id, acc.sessionKey)
    } catch (err) {
      console.error(`[Baileys] failed to init session for ${acc.id}`, err)
    }
  }
}

export async function ensureWhatsAppSessions() {
  const accounts = await prisma.whatsAppAccount.findMany({
    where: {
      isActive: true,
      connectionStatus: { in: ['DISCONNECTED', 'QR_PENDING', 'ERROR'] },
    },
    select: { id: true, sessionKey: true },
  })

  for (const acc of accounts) {
    try {
      await connectWhatsAppSession(acc.id, acc.sessionKey)
    } catch (err) {
      console.error(`[Baileys] failed to ensure session for ${acc.id}`, err)
    }
  }
}

export async function sendWhatsAppText(accountId: string, sessionKey: string, toPhone: string, text: string) {
  const sock = sockets.get(accountId) || await connectWhatsAppSession(accountId, sessionKey)
  const jid = normalizePhone(toPhone)
  const response = await sock.sendMessage(jid, { text })
  return {
    participantJid: jid,
    providerMessageId: response?.key?.id || null,
  }
}

export async function recordManagedWhatsAppOutbound(accountId: string, toPhone: string, payload: {
  participantName?: string | null
  providerMessageId?: string | null
  body: string
  status?: string | null
  sentAt?: Date | null
  metadata?: Record<string, unknown>
}) {
  const jid = normalizePhone(toPhone)
  await upsertManagedConversation(accountId, jid, {
    participantName: payload.participantName,
    messageId: payload.providerMessageId || null,
    direction: 'outbound',
    body: payload.body,
    status: payload.status || 'sent',
    sentAt: payload.sentAt || new Date(),
    metadata: payload.metadata,
  })
  return { participantJid: jid }
}
