'use client'

export interface ApiKeyRecord {
  id: string
  name: string
  keyPrefix: string
  isActive: boolean
  lastUsedAt: string | null
  createdAt: string
  revokedAt: string | null
  _count: {
    apiDispatchRequests: number
  }
}

export interface ApiDispatchRequestRecord {
  id: string
  channel: 'EMAIL' | 'WHATSAPP'
  status: 'QUEUED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'REJECTED_NO_CAPACITY'
  requestedTo: string
  subject: string | null
  content: string
  errorMessage: string | null
  providerMessageId: string | null
  queuedAt: string | null
  processedAt: string | null
  createdAt: string
  apiKey: {
    id: string
    name: string
    keyPrefix: string
  }
  selectedMailAccount: {
    id: string
    email: string
    displayName: string
  } | null
  selectedWhatsAppAccount: {
    id: string
    displayName: string
    phoneNumber: string | null
  } | null
}

export interface ApiManagementOverview {
  email: {
    total: number
    active: number
    warmed: number
    eligible: number
    remainingQuota: number
  }
  whatsapp: {
    total: number
    active: number
    connected: number
    eligible: number
    remainingQuota: number
  }
}
