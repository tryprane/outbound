import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

export interface GenerateMailOptions {
  prompt: string
  agencyName?: string
  website?: string
  scrapedContent?: string
  campaignType: 'indian' | 'international'
}

export interface GeneratedMail {
  subject: string
  body: string
}

const GEMINI_MAX_ATTEMPTS = 3

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
      // continue to next candidate
    }
  }

  return null
}

export async function generateOutreachEmail(
  options: GenerateMailOptions
): Promise<GeneratedMail> {
  const { prompt, agencyName, website, scrapedContent, campaignType } = options

  const systemContext = `You are an expert outbound sales copywriter for a digital marketing agency.
You write concise, highly personalized cold outreach emails.
Tone: ${campaignType === 'indian' ? 'Professional yet warm, suitable for Indian B2B market' : 'Professional, concise, suitable for international market'}.
IMPORTANT: Output ONLY valid JSON in this exact format:
{
  "subject": "...",
  "body": "..."
}
Do not include any markdown, explanation, or extra text.`

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const userPrompt = `${prompt}

Agency Details:
- Name: ${agencyName || 'Not available'}
- Website: ${website || 'Not available'}
${scrapedContent ? `- Additional context from website: ${scrapedContent.substring(0, 500)}` : ''}

Generate a personalized outreach email following the above instructions.
This is attempt ${attempt}/${GEMINI_MAX_ATTEMPTS}. Return strict JSON only.`

    try {
      const result = await model.generateContent([systemContext, userPrompt])
      const text = result.response.text().trim()
      const parsed = parseGeneratedMail(text)
      if (parsed) return parsed
      lastError = new Error('Gemini returned invalid JSON format')
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  console.warn('[Gemini] Falling back to deterministic preview:', lastError?.message ?? 'unknown error')
  const name = agencyName || 'your team'
  return {
    subject: `Quick idea for ${name}`,
    body: `Hi ${name},\n\nI wanted to quickly share one tailored outreach idea that may improve your lead flow.\n\nIf useful, I can send a short plan mapped to your current positioning.\n\nBest regards,`,
  }
}
