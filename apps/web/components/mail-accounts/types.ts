'use client'

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pages: number
  limit: number
}

export interface MailAccount {
  id: string
  type: 'zoho' | 'gmail'
  email: string
  displayName: string
  dailyLimit: number
  sentToday: number
  isActive: boolean
  warmupStatus: 'COLD' | 'WARMING' | 'WARMED' | 'PAUSED'
  warmupStage: number
  recommendedDailyLimit: number
  warmupAutoEnabled: boolean
  warmupStartedAt: string | null
  warmupCompletedAt: string | null
  warmupPausedAt: string | null
  lastMailSentAt: string | null
  tokenExpiry: string | null
  zohoAccountId?: string | null
  zohoRegion?: string | null
  zohoTokenExpiry?: string | null
  zohoMailboxMode?: 'imap' | 'api'
  zohoLastTokenRefreshAt?: string | null
  zohoAuthError?: string | null
  mailboxConnectionMethod?: 'imap' | 'api' | 'oauth' | 'unknown'
  zohoApiConnected?: boolean
  zohoSmtpConnected?: boolean
  zohoSetupStatus?: 'complete' | 'pending_oauth' | 'pending_smtp' | 'pending_both'
  connectionReady?: boolean
  mailboxSyncAvailable?: boolean
  imapHost: string | null
  imapPort: number | null
  imapSecure: boolean
  mailboxLastSyncedAt: string | null
  mailboxSyncStatus: 'idle' | 'syncing' | 'error'
  mailboxSyncError: string | null
  zohoImapEnabled?: boolean
  mailboxHealthScore: number
  mailboxHealthStatus: string
  warmupHealthSnapshots: Array<{
    id: string
    periodEnd: string
    healthScore: number
    healthStatus: string
    inboxRate: number
    spamRate: number
    readRate: number
    replyRate: number
    rescueRate: number
    notes?: string | null
  }>
  warmupStats7d: {
    total: number
    sent: number
    failed: number
    bounced: number
    successRate: number
  }
  _count: { sentMails: number }
}

export interface WhatsAppAccount {
  id: string
  displayName: string
  phoneNumber: string | null
  isActive: boolean
  connectionStatus: 'DISCONNECTED' | 'QR_PENDING' | 'CONNECTED' | 'ERROR'
  lastQr: string | null
  lastError: string | null
  lastConnectedAt?: string | null
  createdAt?: string
  dailyLimit: number
  sentToday: number
  _count: { sentMessages: number }
}

export interface WarmupRecipient {
  id: string
  email: string
  name: string | null
  isActive: boolean
  isSystem: boolean
  mailAccountId: string | null
  createdAt: string
}

export interface MailboxMessage {
  id: string
  mailAccountId: string
  providerMessageId: string
  providerThreadId: string | null
  folderKind: 'INBOX' | 'SPAM' | 'SENT' | 'ARCHIVE' | 'OTHER'
  folderName: string | null
  direction: 'inbound' | 'outbound'
  fromEmail: string | null
  toEmail: string | null
  subject: string | null
  snippet: string | null
  sentAt: string | null
  receivedAt: string | null
  isWarmup: boolean
  isRead: boolean
  isStarred: boolean
  isSpam: boolean
  openedAt: string | null
  repliedAt: string | null
  rescuedAt: string | null
  createdAt: string
  mailAccount: { email: string; displayName: string; type: 'zoho' | 'gmail' }
}

export interface WarmupOverview {
  total: number
  warming: number
  warmed: number
  cold: number
  paused: number
  autoEnabled: number
  activeMailboxes: number
  activeCustomRecipients?: number
  totalRecipients?: number
}

export interface WarmupLog {
  id: string
  senderMailAccountId: string
  senderEmail: string
  senderDisplayName: string | null
  recipientEmail: string
  recipientDisplayEmail: string
  recipientDisplayName: string | null
  recipientType: 'system' | 'external'
  recipientMailAccountId: string | null
  direction: 'outbound' | 'reply'
  subject: string
  status: 'sent' | 'failed' | 'bounced'
  stage: number
  sentAt: string
  errorMessage: string | null
  senderMailAccount: { email: string; displayName: string }
  recipientMailAccount: { email: string; displayName: string } | null
}

export interface DomainDiagnostics {
  domain: string
  providerHint: 'gmail' | 'zoho' | 'unknown'
  checkedAt: string
  mxHosts: string[]
  mxIps: string[]
  spf: {
    found: boolean
    valid: boolean
    record: string | null
    providerAligned: boolean
  }
  dmarc: {
    found: boolean
    valid: boolean
    record: string | null
    policy: string | null
  }
  dkim: {
    foundSelectors: string[]
    checkedSelectors: string[]
    providerAligned: boolean
  }
  blacklist: {
    checked: boolean
    listedOn: string[]
    checkedZones: string[]
  }
  riskScore: number
  severity: 'ok' | 'warning' | 'critical'
  recommendedAction: string
  warnings: string[]
}

export interface DomainHealthSummary {
  domain: string
  providerHint: 'gmail' | 'zoho' | 'unknown'
  mailboxCount: number
  healthyCount: number
  warmingCount: number
  atRiskCount: number
  pausedCount: number
  averageHealthScore: number
  activeCampaignCount: number
  sentCount7d: number
  failedCount7d: number
  bouncedCount7d: number
  bounceRate7d: number
  failureRate7d: number
  complaintCount14d: number
  healthStatus: 'healthy' | 'warming' | 'at_risk' | 'paused'
  notes: string
}

export interface DomainHealthSnapshot {
  id: string
  domain: string
  providerHint: 'gmail' | 'zoho' | 'unknown'
  periodStart: string
  periodEnd: string
  mailboxCount: number
  healthyCount: number
  warmingCount: number
  atRiskCount: number
  pausedCount: number
  averageHealthScore: number
  activeCampaignCount: number
  notes: string | null
  createdAt: string
}

export type ActiveTab = 'accounts' | 'add-zoho' | 'add-gmail' | 'add-whatsapp'
