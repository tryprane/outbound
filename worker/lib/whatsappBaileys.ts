import * as fs from 'fs'
import * as path from 'path'
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { prisma } from '~/lib/prisma'

type SocketMap = Map<string, ReturnType<typeof makeWASocket>>

const sockets: SocketMap = new Map()
const sessionRoot = path.resolve(process.cwd(), '.baileys-sessions')
let latestVersionCache: number[] | null = null

if (!fs.existsSync(sessionRoot)) {
  fs.mkdirSync(sessionRoot, { recursive: true })
}

function normalizePhone(input: string): string {
  const trimmed = input.trim()
  if (trimmed.endsWith('@s.whatsapp.net')) return trimmed
  const digits = trimmed.replace(/[^\d]/g, '')
  return `${digits}@s.whatsapp.net`
}

async function getSocketVersion() {
  if (latestVersionCache) return latestVersionCache
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`[Baileys] using WA version ${version.join('.')} (isLatest=${isLatest})`)
    latestVersionCache = version
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
  await sock.sendMessage(jid, { text })
}
