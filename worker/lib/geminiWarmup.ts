import { GoogleGenerativeAI } from '@google/generative-ai'

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

const GEMINI_MODEL = 'gemini-2.5-flash'

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return null
  return new GoogleGenerativeAI(apiKey)
}

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

export async function generateWarmupMailWithGemini(
  options: GenerateWarmupMailOptions
): Promise<GeneratedWarmupMail | null> {
  const client = getClient()
  if (!client) return null

  const model = client.getGenerativeModel({ model: GEMINI_MODEL })
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
- Write friendly, low-pressure professional email copy.
- Use simple HTML only in body, limited to <p> and <br/>.
- No links, no signatures beyond the sender name, no placeholders, no markdown.
- Avoid sales language, urgency, spammy wording, and promotional claims.
- This is a ${isReply ? 'reply to a warmup email' : 'fresh outbound warmup message'}.${isReply ? '\n- Match the subject to the original: prefix it with "Re: " followed by the original subject line.' : '\n- Vary the angle across simple hello notes, light check-ins, appreciation notes, shared-context notes, and casual follow-ups.'}`

  const userPrompt = isReply
    ? `Write one short warmup reply email.
Sender name (the one REPLYING): ${senderName}
Recipient first name (the one who SENT the original): ${recipientName}
${originalSubject ? `Original email subject: ${originalSubject}` : ''}

The tone should feel like a brief, genuine reply from someone who received a friendly note.
Subject must start with "Re: " followed by the original subject (or a close variation if unknown).
Keep the body under 60 words. Return strict JSON only.`
    : `Write one short warmup email.
Sender name: ${senderName}
Recipient first name: ${recipientName}
Warmup stage: ${stage} out of an early ramp-up sequence.

The tone should feel like a light professional check-in between two people who know of each other loosely.
Avoid sounding like outreach automation or sales follow-up.
Keep the subject under 6 words and the body under 90 words.
Return strict JSON only.`

  try {
    const result = await model.generateContent([systemPrompt, userPrompt])
    return parseGeneratedWarmupMail(result.response.text())
  } catch (error) {
    console.warn(
      '[Warmup] Gemini generation failed:',
      error instanceof Error ? error.message : String(error)
    )
    return null
  }
}
