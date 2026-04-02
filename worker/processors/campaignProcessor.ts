import { Worker, Job, QueueEvents } from 'bullmq'
import { randomUUID } from 'crypto'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getRedisConnection } from '~/lib/redis'
import { getWorkerConcurrency } from '~/lib/workerConcurrency'
import { prisma } from '~/lib/prisma'
import { CampaignJobData } from '~/queues/campaignQueue'
import { scrapeQueue, ScrapeJobData } from '~/queues/scrapeQueue'
import { mailQueue, MailJobData } from '~/queues/mailQueue'
import { whatsappQueue, WhatsAppJobData } from '~/queues/whatsappQueue'
import {
  pickReservedCampaignMailAccount,
  pickReservedCampaignWhatsAppAccount,
  releaseMailAccountReservation,
  releaseWhatsAppAccountReservation,
} from '~/lib/apiDispatchPool'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

interface GeneratedMail {
  subject: string
  body: string
}

interface GeneratedWhatsApp {
  message: string
}

const GEMINI_MAX_ATTEMPTS = 3

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeLineBreaks(input: string): string {
  return input.replace(/\r\n/g, '\n').trim()
}

function toHtmlFromPlainText(text: string): string {
  const normalized = normalizeLineBreaks(text)
  if (!normalized) return '<p>Hello,</p><p>Just checking in regarding our outreach request.</p>'

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)

  return paragraphs.join('\n')
}

function ensureEmailHtml(body: string): string {
  const trimmed = body.trim()
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(trimmed)
  return looksLikeHtml ? trimmed : toHtmlFromPlainText(trimmed)
}

function parseGeneratedMail(raw: string): GeneratedMail | null {
  const text = raw.trim()
  const candidates: string[] = [text]

  const codeFenceMatches = text.match(/```(?:json)?\s*([\s\S]*?)```/gi) || []
  for (const fence of codeFenceMatches) {
    const cleaned = fence.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
    if (cleaned) candidates.push(cleaned)
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) candidates.push(jsonMatch[0])

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      const subject = String(parsed.subject ?? parsed.title ?? '').trim().replace(/^subject:\s*/i, '')
      const body = String(parsed.body ?? parsed.message ?? parsed.email ?? '').trim().replace(/^body:\s*/i, '')
      if (!subject || !body) continue
      return { subject, body }
    } catch {
      // Try the next extraction strategy.
    }
  }

  return null
}

function fallbackMail(agencyName?: string): GeneratedMail {
  const name = agencyName?.trim() || 'your team'
  return {
    subject: `Quick idea for ${name}`,
    body: `Hi ${name},\n\nI wanted to quickly reach out with one idea that could improve your lead flow with a low-effort campaign setup.\n\nIf useful, I can share a short breakdown tailored to your current positioning.\n\nBest regards,`,
  }
}

async function generateMail(options: {
  prompt: string
  agencyName?: string
  website?: string
  campaignType: 'indian' | 'international'
}): Promise<GeneratedMail> {
  const { prompt, agencyName, website, campaignType } = options

  const systemContext = `You are an expert outbound sales copywriter for a digital marketing agency.
Write concise, personalized cold outreach emails.
Tone: ${campaignType === 'indian' ? 'Professional yet warm, suitable for Indian B2B market' : 'Professional, concise, suitable for international market'}.
Return plain text content for body with natural line breaks.
IMPORTANT: Output ONLY valid JSON in this exact format:
{"subject":"...","body":"..."}
No markdown, no explanation, no extra text.`

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const userPrompt = `${prompt}

Agency Details:
- Name: ${agencyName || 'Not available'}
- Website: ${website || 'Not available'}

Generate a personalized outreach email.
This is attempt ${attempt}/${GEMINI_MAX_ATTEMPTS}. Return strict JSON only.`

    try {
      const result = await model.generateContent([systemContext, userPrompt])
      const text = result.response.text().trim()
      const parsed = parseGeneratedMail(text)
      if (parsed) return parsed
      lastError = new Error('Gemini returned unparsable payload')
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  console.warn('[CampaignProcessor] Gemini fallback used:', lastError?.message ?? 'unknown error')
  return fallbackMail(agencyName)
}

async function generateWhatsAppMessage(options: {
  prompt: string
  agencyName?: string
  website?: string
  campaignType: 'indian' | 'international'
}): Promise<GeneratedWhatsApp> {
  const { prompt, agencyName, website, campaignType } = options

  const systemContext = `You are an outbound WhatsApp copywriter.
Write a concise, human-like WhatsApp message for B2B outreach.
Tone: ${campaignType === 'indian' ? 'Professional and friendly for Indian market' : 'Professional and concise for international market'}.
Keep it short (max 80 words), no markdown, no emojis overload.
Return ONLY JSON:
{"message":"..."}`

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const userPrompt = `${prompt}

Lead details:
- Name: ${agencyName || 'Not available'}
- Website: ${website || 'Not available'}

Return strict JSON only. Attempt ${attempt}/${GEMINI_MAX_ATTEMPTS}.`

    try {
      const result = await model.generateContent([systemContext, userPrompt])
      const text = result.response.text().trim()
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
        const message = String(parsed.message ?? '').trim()
        if (message) return { message }
      }
    } catch {
      // Retry.
    }
  }

  return {
    message: `Hi ${agencyName || 'there'}, sharing a quick outreach message. Let me know if you'd like a short plan tailored to your current growth goals.`,
  }
}

async function processCampaignJob(job: Job<CampaignJobData>) {
  const { campaignId } = job.data
  const reservationKey = `campaign:${campaignId}:${job.id ?? Date.now()}`

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      csvFile: { select: { id: true, rowCount: true } },
      mailAccounts: { include: { mailAccount: true } },
      whatsappAccounts: { include: { whatsappAccount: true } },
    },
  })

  if (!campaign) {
    console.warn(`[CampaignProcessor] Campaign ${campaignId} not found`)
    return
  }

  if (campaign.status !== 'active') {
    console.log(`[CampaignProcessor] Campaign ${campaignId} is ${campaign.status}, skipping`)
    return
  }

  if (campaign.currentRowIndex >= campaign.csvFile.rowCount) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'completed' } })
    console.log(`[CampaignProcessor] Campaign ${campaignId} completed`)
    return
  }

  const row = await prisma.csvRow.findFirst({
    where: { csvFileId: campaign.csvFileId, rowIndex: campaign.currentRowIndex },
  })

  if (!row) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentRowIndex: { increment: 1 } } })
    return
  }

  const emailToCheck = row.email || row.scrapedEmail
  if (campaign.channel === 'EMAIL' && emailToCheck) {
    const unsub = await prisma.unsubscribeList.findUnique({ where: { email: emailToCheck } })
    if (unsub) {
      console.log(`[CampaignProcessor] ${emailToCheck} is unsubscribed, skipping`)
      await prisma.campaign.update({ where: { id: campaignId }, data: { currentRowIndex: { increment: 1 } } })
      return
    }
  }

  if (campaign.channel === 'WHATSAPP') {
    const waAccount = await pickReservedCampaignWhatsAppAccount(
      campaignId,
      campaign.dailyMailsPerAccount,
      reservationKey
    )

    if (!waAccount) {
      console.log(`[CampaignProcessor] Campaign ${campaignId} has no eligible WhatsApp accounts right now`)
      return
    }

    const raw = row.rawData as Record<string, string>
    const mappedPhone = campaign.whatsappColumn ? (raw[campaign.whatsappColumn] || '') : ''
    const finalPhone = (row.whatsapp || row.scrapedPhone || mappedPhone || '').toString().trim()

    if (!finalPhone) {
      await releaseWhatsAppAccountReservation(waAccount.id, reservationKey)
      await prisma.campaign.update({ where: { id: campaignId }, data: { currentRowIndex: { increment: 1 } } })
      return
    }

    const existing = await prisma.sentWhatsAppMessage.findFirst({
      where: { campaignId, toPhone: finalPhone },
    })

    if (existing) {
      await releaseWhatsAppAccountReservation(waAccount.id, reservationKey)
      await prisma.campaign.update({ where: { id: campaignId }, data: { currentRowIndex: { increment: 1 } } })
      return
    }

    const generated = await generateWhatsAppMessage({
      prompt: campaign.prompt,
      agencyName: row.name ?? undefined,
      website: row.website ?? undefined,
      campaignType: campaign.type as 'indian' | 'international',
    })

    const waJobData: WhatsAppJobData = {
      campaignId,
      csvRowId: row.id,
      whatsappAccountId: waAccount.id,
      reservationKey,
      toPhone: finalPhone,
      message: generated.message,
    }

    try {
      await whatsappQueue.add('send-whatsapp' as never, waJobData as never)
    } catch (error) {
      await releaseWhatsAppAccountReservation(waAccount.id, reservationKey)
      throw error
    }

    await prisma.campaign.update({ where: { id: campaignId }, data: { currentRowIndex: { increment: 1 } } })
    return
  }

  const account = await pickReservedCampaignMailAccount(campaignId, campaign.dailyMailsPerAccount, reservationKey)
  if (!account) {
    console.log(`[CampaignProcessor] Campaign ${campaignId} has no eligible mail accounts right now`)
    return
  }

  let finalEmail = row.email || row.scrapedEmail

  if (!finalEmail && campaign.scrapeEmail && row.website) {
    const extractArr: Array<'email' | 'phone'> = ['email']
    if (campaign.scrapeWhatsapp) extractArr.push('phone')

    const scrapeJobData: ScrapeJobData = {
      csvRowId: row.id,
      url: row.website,
      campaignType: campaign.type as 'indian' | 'international',
      extract: extractArr,
    }

    const scrapeJob = await scrapeQueue.add('scrape' as never, scrapeJobData as never)
    const queueEvents = new QueueEvents('scrape-queue', { connection: getRedisConnection() })

    try {
      await scrapeJob.waitUntilFinished(queueEvents, 35_000)
      const refreshed = await prisma.csvRow.findUnique({ where: { id: row.id } })
      finalEmail = refreshed?.scrapedEmail || null
    } catch {
      console.warn(`[CampaignProcessor] Scrape timed out for row ${row.id}`)
    } finally {
      await queueEvents.close()
    }
  }

  if (!finalEmail) {
    console.log(`[CampaignProcessor] Row ${row.id} has no email, skipping`)
    await releaseMailAccountReservation(account.id, reservationKey)
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentRowIndex: { increment: 1 } } })
    return
  }

  const perCampaignDupe = await prisma.sentMail.findFirst({
    where: { campaignId, toEmail: finalEmail },
  })
  if (perCampaignDupe) {
    console.log(`[CampaignProcessor] Duplicate in campaign, skipping ${finalEmail}`)
    await releaseMailAccountReservation(account.id, reservationKey)
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentRowIndex: { increment: 1 } } })
    return
  }

  const globalDupe = await prisma.sentMail.findFirst({
    where: { toEmail: finalEmail, status: 'sent' },
  })
  if (globalDupe) {
    console.log(
      `[CampaignProcessor] Global duplicate, ${finalEmail} already received mail from campaign ${globalDupe.campaignId}, skipping`
    )
    await releaseMailAccountReservation(account.id, reservationKey)
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentRowIndex: { increment: 1 } } })
    return
  }

  let generated: GeneratedMail
  try {
    generated = await generateMail({
      prompt: campaign.prompt,
      agencyName: row.name ?? undefined,
      website: row.website ?? undefined,
      campaignType: campaign.type as 'indian' | 'international',
    })
  } catch (err) {
    console.error(`[CampaignProcessor] Gemini failed for row ${row.id}:`, err)
    await releaseMailAccountReservation(account.id, reservationKey)
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentRowIndex: { increment: 1 } } })
    return
  }

  const mailJobData: MailJobData = {
    campaignId,
    csvRowId: row.id,
    mailAccountId: account.id,
    reservationKey,
    toEmail: finalEmail,
    subject: generated.subject,
    body: ensureEmailHtml(generated.body),
    trackingToken: randomUUID(),
  }

  try {
    await mailQueue.add('send-mail' as never, mailJobData as never)
  } catch (error) {
    await releaseMailAccountReservation(account.id, reservationKey)
    throw error
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { currentRowIndex: { increment: 1 } } })

  console.log(`[CampaignProcessor] Campaign ${campaignId} queued mail to ${finalEmail} via ${account.email}`)
}

export function startCampaignWorker() {
  const worker = new Worker<CampaignJobData>('campaign-queue', processCampaignJob, {
    connection: getRedisConnection(),
    concurrency: getWorkerConcurrency('campaign'),
  })

  worker.on('completed', (job) => {
    console.log(`[CampaignProcessor] Job ${job.id} done for campaign ${job.data.campaignId}`)
  })

  worker.on('failed', (job, err: Error) => {
    console.error(`[CampaignProcessor] Job ${job?.id} failed:`, err.message)
  })

  console.log('[Worker] Campaign worker started')
  return worker
}
