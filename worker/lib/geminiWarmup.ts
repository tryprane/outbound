export type GeneratedWarmupMail = {
  subject: string
  body: string
}

type GenerateWarmupMailOptions = {
  senderName: string
  recipientName: string
  stage: number
  direction: 'outbound' | 'reply'
  originalSubject?: string
}

const PRIMARY_WARMUP_MODEL =
  process.env.WARMUP_PRIMARY_MODEL?.trim() ||
  process.env.REPLY_ANALYSIS_MODEL?.trim() ||
  'gemma2:2b'
const SECONDARY_WARMUP_MODEL =
  process.env.WARMUP_GEMMA_MODEL?.trim() ||
  process.env.WARMUP_SECONDARY_MODEL?.trim() ||
  ''
const WARMUP_BASE_URL = (
  process.env.WARMUP_LLM_BASE_URL ||
  process.env.REPLY_ANALYSIS_BASE_URL ||
  'http://127.0.0.1:11434'
).replace(/\/+$/, '')
const WARMUP_TIMEOUT_MS = Number.parseInt(
  process.env.WARMUP_LLM_TIMEOUT_MS ??
    process.env.REPLY_ANALYSIS_TIMEOUT_MS ??
    '30000',
  10
)
const WARMUP_MAX_TOKENS = Number.parseInt(
  process.env.WARMUP_LLM_MAX_TOKENS ?? '280',
  10
)
const SECONDARY_WARMUP_MODEL_PROBABILITY = Math.min(
  1,
  Math.max(0, Number(process.env.WARMUP_GEMMA_PROBABILITY ?? 0.35))
)

function parseGeneratedWarmupMail(raw: string): GeneratedWarmupMail | null {
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
      const subject = String(parsed.subject ?? '').trim()
      const body = String(parsed.body ?? '').trim()
      if (!subject || !body) continue
      return { subject, body }
    } catch {
      continue
    }
  }

  return null
}

async function generateForModel(
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<GeneratedWarmupMail | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS)

  try {
    const response = await fetch(`${WARMUP_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: WARMUP_MAX_TOKENS,
        stream: false,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      throw new Error(`LLM request failed with ${response.status}`)
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload.choices?.[0]?.message?.content?.trim() || ''
    return parseGeneratedWarmupMail(content)
  } finally {
    clearTimeout(timeout)
  }
}

export async function generateWarmupMailWithGemini(
  options: GenerateWarmupMailOptions
): Promise<GeneratedWarmupMail | null> {
  const { senderName, recipientName, stage, direction, originalSubject } = options
  const isReply = direction === 'reply'

  const systemPrompt = `You generate realistic email warmup messages used for inbox reputation warming.
Return ONLY valid JSON in this exact shape:
{
  "subject": "...",
  "body": "..."
}
Rules:
- Keep it short and natural.
- Write like a real human maintaining a normal thread, not an outreach bot.
- Vary sentence structure, intent, and tone across messages.
- Use simple HTML only in body, limited to <p> and <br/>.
- No links, no promotional wording, no markdown, no placeholders.
- No exaggerated enthusiasm, no urgency, no CTA.
- Keep the subject believable and understated.
- This is a ${isReply ? 'reply to an existing warmup thread' : 'new warmup message between two real people'}.
${isReply ? '- Match the thread naturally. Subject should begin with "Re: " and feel like a real continuation.' : '- Make each message feel unique, with varied reasons for writing and varied cadence.'}`

  const userPrompt = isReply
    ? `Write one short warmup reply email.
Sender name (replying): ${senderName}
Recipient first name: ${recipientName}
Original subject: ${originalSubject || 'Quick follow-up'}

Goal:
- sound like a natural short reply in an ongoing relationship
- keep it under 70 words
- make it feel personal and different from canned acknowledgements

Return strict JSON only.`
    : `Write one short warmup email.
Sender name: ${senderName}
Recipient first name: ${recipientName}
Warmup stage: ${stage}

Goal:
- sound like a real low-stakes human email
- vary the reason for writing
- keep subject under 7 words
- keep body under 100 words
- make the message feel unique and conversational

Return strict JSON only.`

  const candidateModels = (
    SECONDARY_WARMUP_MODEL && Math.random() < SECONDARY_WARMUP_MODEL_PROBABILITY
      ? [SECONDARY_WARMUP_MODEL, PRIMARY_WARMUP_MODEL]
      : [PRIMARY_WARMUP_MODEL]
  ).filter(Boolean)

  for (const model of candidateModels) {
    try {
      const generated = await generateForModel(model, systemPrompt, userPrompt)
      if (generated) return generated
    } catch (error) {
      console.warn(
        `[Warmup] ${model} generation failed:`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  return null
}
