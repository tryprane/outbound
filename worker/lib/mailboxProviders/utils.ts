export function extractEmailAddress(input?: string | null): string | null {
  if (!input) return null
  const match = input.match(/<([^>]+)>/)
  if (match?.[1]) return match[1].trim().toLowerCase()
  if (input.includes('@')) return input.trim().toLowerCase()
  return null
}

export function safeDate(input?: string | number | Date | null): Date | null {
  if (!input) return null
  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

export function uniqByProviderMessageId<T extends { providerMessageId: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    if (seen.has(item.providerMessageId)) continue
    seen.add(item.providerMessageId)
    result.push(item)
  }
  return result
}
