/**
 * column-detector.ts
 * Heuristic + regex based column auto-detection.
 * Maps messy CSV column headers to standard OutreachOS fields.
 */

export type StandardField = 'name' | 'website' | 'email' | 'phone' | 'ignore'

export interface ColumnMapping {
  [csvHeader: string]: StandardField
}

// Keywords that suggest each standard field
const NAME_KEYWORDS = ['name', 'agency', 'company', 'business', 'brand', 'firm', 'org', 'organization', 'client']
const WEBSITE_KEYWORDS = ['website', 'url', 'domain', 'site', 'web', 'link', 'homepage']
const EMAIL_KEYWORDS = ['email', 'mail', 'e-mail', 'contact']
const PHONE_KEYWORDS = ['phone', 'mobile', 'whatsapp', 'wa', 'tel', 'telephone', 'number', 'contact_number', 'cell']

// Regex for data-level detection (check sample values)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const URL_REGEX = /^(https?:\/\/)?(www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/
const PHONE_REGEX = /(\+?\d[\d\s\-().]{7,20}\d)/

function normalize(str: string): string {
  return str.toLowerCase().replace(/[\s_\-./]/g, '')
}

function matchesKeywords(header: string, keywords: string[]): boolean {
  const norm = normalize(header)
  return keywords.some((kw) => norm.includes(normalize(kw)))
}

function detectFromSampleValues(
  sampleValues: string[]
): StandardField | null {
  const nonEmpty = sampleValues.filter(Boolean).slice(0, 5)
  if (!nonEmpty.length) return null

  const emailMatches = nonEmpty.filter((v) => EMAIL_REGEX.test(v.trim()))
  if (emailMatches.length >= nonEmpty.length * 0.6) return 'email'

  const urlMatches = nonEmpty.filter((v) => URL_REGEX.test(v.trim()))
  if (urlMatches.length >= nonEmpty.length * 0.6) return 'website'

  const phoneMatches = nonEmpty.filter((v) => PHONE_REGEX.test(v.trim()))
  if (phoneMatches.length >= nonEmpty.length * 0.6) return 'phone'

  return null
}

/**
 * Auto-detects column mappings from CSV headers + sample row values.
 */
export function detectColumns(
  headers: string[],
  sampleRows: Record<string, string>[]
): ColumnMapping {
  const mapping: ColumnMapping = {}
  const usedFields = new Set<StandardField>()

  for (const header of headers) {
    let detected: StandardField = 'ignore'

    // 1) Header keyword matching
    if (matchesKeywords(header, NAME_KEYWORDS)) detected = 'name'
    else if (matchesKeywords(header, WEBSITE_KEYWORDS)) detected = 'website'
    else if (matchesKeywords(header, EMAIL_KEYWORDS)) detected = 'email'
    else if (matchesKeywords(header, PHONE_KEYWORDS)) detected = 'phone'
    else {
      // 2) Data-level detection from sample values
      const sampleValues = sampleRows.map((row) => row[header] || '')
      const fromData = detectFromSampleValues(sampleValues)
      if (fromData) detected = fromData
    }

    // Avoid assigning the same standard field to two columns
    // (first match wins; extras fall back to ignore)
    if (detected !== 'ignore' && usedFields.has(detected)) {
      detected = 'ignore'
    }
    if (detected !== 'ignore') usedFields.add(detected)

    mapping[header] = detected
  }

  return mapping
}

export const STANDARD_FIELD_LABELS: Record<StandardField, string> = {
  name: '🏢 Agency / Company Name',
  website: '🌐 Website URL',
  email: '📧 Email Address',
  phone: '📱 Phone / WhatsApp',
  ignore: '⛔ Ignore this column',
}
