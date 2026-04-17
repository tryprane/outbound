type ReplyAnalysisLabel =
  | 'interested'
  | 'meeting_request'
  | 'follow_up_later'
  | 'wrong_person'
  | 'not_interested'
  | 'unsubscribe'
  | 'auto_reply'
  | 'generic'

type ReplyAnalysisPriority = 'high' | 'medium' | 'low'

export type ReplyAnalysisResult = {
  label: ReplyAnalysisLabel
  shouldReply: boolean
  priority: ReplyAnalysisPriority
  summary: string
  reason: string
  model: string
  raw: Record<string, unknown>
}

type AnalyzeReplyOptions = {
  subject?: string | null
  snippet?: string | null
  fromEmail?: string | null
  toEmail?: string | null
}

const RULE_MODEL = 'rules'
const DEFAULT_MODEL = process.env.REPLY_ANALYSIS_MODEL?.trim() || 'gemma2:2b'
const BASE_URL = (process.env.REPLY_ANALYSIS_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '')
const TIMEOUT_MS = Number.parseInt(process.env.REPLY_ANALYSIS_TIMEOUT_MS ?? '30000', 10)
const MAX_TOKENS = Number.parseInt(process.env.REPLY_ANALYSIS_MAX_TOKENS ?? '220', 10)

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeText(value?: string | null) {
  return normalizeWhitespace(value || '').toLowerCase()
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}...`
}

function formatSummary(source: string, fallback: string) {
  const normalized = normalizeWhitespace(source)
  if (!normalized) return fallback
  return truncate(normalized, 120)
}

function formatReason(source: string, fallback: string) {
  const normalized = normalizeWhitespace(source)
  if (!normalized) return fallback
  return truncate(normalized, 220)
}

function keywordMatch(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function runRules(text: string): ReplyAnalysisResult | null {
  if (keywordMatch(text, [/out of office/i, /automatic reply/i, /auto(?:matic)? response/i, /limited access/i, /ticket was created/i, /vacation/i])) {
    return {
      label: 'auto_reply',
      shouldReply: false,
      priority: 'low',
      summary: 'Automatic response received',
      reason: 'The reply looks like an out-of-office or automated acknowledgement.',
      model: RULE_MODEL,
      raw: { source: 'rules' },
    }
  }

  if (keywordMatch(text, [/remove me from/i, /stop emailing/i, /unsubscribe/i, /do not follow up/i, /don't follow up/i, /dont follow up/i, /don't email/i, /dont email/i])) {
    return {
      label: 'unsubscribe',
      shouldReply: false,
      priority: 'high',
      summary: 'Unsubscribe request received',
      reason: 'The contact explicitly asked to stop receiving outreach.',
      model: RULE_MODEL,
      raw: { source: 'rules' },
    }
  }

  if (keywordMatch(text, [/not the right person/i, /wrong person/i, /you can try/i, /speak with/i, /contact .*@/i, /i handle .* not/i])) {
    return {
      label: 'wrong_person',
      shouldReply: false,
      priority: 'medium',
      summary: 'Wrong contact pointed elsewhere',
      reason: 'The recipient says they are not the right owner for this conversation.',
      model: RULE_MODEL,
      raw: { source: 'rules' },
    }
  }

  if (keywordMatch(text, [/no thanks/i, /not interested/i, /we.?re good/i, /already working with/i, /not looking to switch/i, /didn.?t work/i])) {
    return {
      label: 'not_interested',
      shouldReply: false,
      priority: 'low',
      summary: 'Not interested at this time',
      reason: 'The contact explicitly declined the offer or said they already have a solution.',
      model: RULE_MODEL,
      raw: { source: 'rules' },
    }
  }

  if (keywordMatch(text, [/next week/i, /thursday/i, /calendar/i, /schedule/i, /short call/i, /book a call/i, /demo/i, /meeting/i])) {
    return {
      label: 'meeting_request',
      shouldReply: true,
      priority: 'high',
      summary: 'Meeting or call requested',
      reason: 'The contact is asking to schedule a conversation or share availability.',
      model: RULE_MODEL,
      raw: { source: 'rules' },
    }
  }

  if (keywordMatch(text, [/circle back/i, /later this year/i, /q[1-4]/i, /next month/i, /after .*launch/i, /budgets reopen/i, /not this month/i])) {
    return {
      label: 'follow_up_later',
      shouldReply: true,
      priority: 'medium',
      summary: 'Asked for a later follow-up',
      reason: 'The contact is not saying no, but wants to revisit later.',
      model: RULE_MODEL,
      raw: { source: 'rules' },
    }
  }

  return null
}

async function runModel(text: string, options: AnalyzeReplyOptions): Promise<ReplyAnalysisResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const systemPrompt = `You analyze cold email replies for an outreach dashboard.
Return one JSON object only with these exact keys:
{
  "label": "interested|meeting_request|follow_up_later|wrong_person|not_interested|unsubscribe|auto_reply|generic",
  "shouldReply": true,
  "priority": "high|medium|low",
  "summary": "short text",
  "reason": "short text"
}

Rules:
- shouldReply means a human sales follow-up should be sent now.
- shouldReply must be false for auto_reply, unsubscribe, wrong_person, generic, and not_interested.
- shouldReply must be true for interested, meeting_request, and follow_up_later.
- priority must be high for unsubscribe, meeting_request, and strong buying intent.
- priority must be medium for follow_up_later and wrong_person when a referral is provided.
- priority must be low for generic, auto_reply, and not_interested.
- generic means acknowledgement or vague receipt without buying intent.
- interested means asks for pricing, details, examples, plan, timeline, or relevant proof.
- wrong_person means they are not the owner/contact.
- auto_reply means out of office or automated acknowledgement.
- Keep summary under 16 words.
- Keep reason under 26 words.
- Output valid JSON only, no markdown.`

  const userPrompt = `Classify this email reply.
From: ${options.fromEmail || 'unknown'}
To: ${options.toEmail || 'unknown'}
Subject: ${options.subject || '(no subject)'}
Reply text: ${text}`

  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: MAX_TOKENS,
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
    let content = payload.choices?.[0]?.message?.content?.trim() || ''
    if (content.startsWith('```')) {
      content = content.replace(/```json/gi, '').replace(/```/g, '').trim()
    }
    if (content.includes('{') && content.includes('}')) {
      content = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)
    }
    const parsed = JSON.parse(content) as Record<string, unknown>

    const label = String(parsed.label || '').trim() as ReplyAnalysisLabel
    const shouldReply = Boolean(parsed.shouldReply)
    const priority = String(parsed.priority || '').trim() as ReplyAnalysisPriority

    if (!label || !priority) {
      throw new Error('Incomplete analysis payload')
    }

    return {
      label,
      shouldReply,
      priority,
      summary: formatSummary(String(parsed.summary || ''), 'Reply analyzed'),
      reason: formatReason(String(parsed.reason || ''), 'LLM classified the reply.'),
      model: DEFAULT_MODEL,
      raw: parsed,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function analyzeReply(options: AnalyzeReplyOptions): Promise<ReplyAnalysisResult> {
  const text = normalizeWhitespace([options.subject, options.snippet].filter(Boolean).join(' | '))
  const normalizedText = normalizeText(text)

  if (!normalizedText) {
    return {
      label: 'generic',
      shouldReply: false,
      priority: 'low',
      summary: 'No reply content available',
      reason: 'There was not enough synced reply text to analyze.',
      model: RULE_MODEL,
      raw: { source: 'empty' },
    }
  }

  const ruleResult = runRules(normalizedText)
  if (ruleResult) return ruleResult

  return runModel(text, options)
}
