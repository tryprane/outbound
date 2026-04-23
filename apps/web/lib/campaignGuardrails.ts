export type CampaignEligibleMailAccount = {
  id: string
  email: string
  type: string
  isActive: boolean
  warmupStatus: 'COLD' | 'WARMING' | 'WARMED' | 'PAUSED'
  mailboxHealthStatus: string
  mailboxHealthScore: number
  mailboxSyncStatus: string
}

export type MailAccountGuardrailResult = {
  eligible: boolean
  reason: string | null
}

export function extractEmailDomain(email: string | null | undefined): string | null {
  const domain = email?.split('@')[1]?.trim().toLowerCase()
  return domain || null
}

export function providerHintFromType(type: string): 'gmail' | 'zoho' | 'unknown' {
  if (type === 'gmail' || type === 'zoho') {
    return type
  }
  return 'unknown'
}

export function evaluateMailAccountGuardrail(
  account: CampaignEligibleMailAccount
): MailAccountGuardrailResult {
  if (!account.isActive) {
    return { eligible: false, reason: 'Mailbox is inactive' }
  }
  if (account.warmupStatus !== 'WARMED') {
    return { eligible: false, reason: 'Mailbox warmup is not complete' }
  }
  if (account.mailboxSyncStatus === 'error') {
    return { eligible: false, reason: 'Mailbox sync is in error state' }
  }
  if (account.mailboxHealthStatus === 'paused') {
    return { eligible: false, reason: 'Mailbox health is paused' }
  }
  return { eligible: true, reason: null }
}

export function assessCampaignDomainRisk(accounts: CampaignEligibleMailAccount[]): string | null {
  const eligibleAccounts = accounts.filter((account) => evaluateMailAccountGuardrail(account).eligible)
  if (eligibleAccounts.length === 0) {
    return 'No healthy eligible sender remains assigned to this campaign.'
  }

  const domainStats = new Map<string, { total: number; unhealthy: number }>()
  for (const account of accounts) {
    const domain = extractEmailDomain(account.email) || 'unknown'
    const current = domainStats.get(domain) || { total: 0, unhealthy: 0 }
    current.total += 1
    if (!evaluateMailAccountGuardrail(account).eligible) current.unhealthy += 1
    domainStats.set(domain, current)
  }

  const riskyDomains = Array.from(domainStats.entries())
    .filter(([, stats]) => stats.total >= 2 && stats.unhealthy >= 2 && stats.unhealthy / stats.total >= 0.6)
    .map(([domain, stats]) => `${domain} (${stats.unhealthy}/${stats.total} unhealthy)`)

  if (riskyDomains.length > 0) {
    return `Domain guardrail triggered for ${riskyDomains.join(', ')}.`
  }

  return null
}
