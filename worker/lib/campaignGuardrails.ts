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
  if (account.mailboxHealthStatus === 'at_risk' || account.mailboxHealthStatus === 'paused') {
    return { eligible: false, reason: `Mailbox health is ${account.mailboxHealthStatus}` }
  }
  if (account.mailboxHealthScore > 0 && account.mailboxHealthScore < 55) {
    return { eligible: false, reason: `Mailbox health score is ${account.mailboxHealthScore}` }
  }
  if (account.mailboxSyncStatus === 'error') {
    return { eligible: false, reason: 'Mailbox sync is in error state' }
  }
  return { eligible: true, reason: null }
}
