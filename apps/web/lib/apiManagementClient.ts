import type {
  ApiDispatchRequestRecord,
  ApiKeyRecord,
  ApiManagementOverview,
} from '@/components/api-management/types'

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit, fallback?: T): Promise<T> {
  try {
    const response = await fetch(input, init)
    const data = await response.json()
    return data as T
  } catch {
    return fallback as T
  }
}

export function fetchApiKeys() {
  return readJson<ApiKeyRecord[]>('/api/api-management/keys', undefined, [])
}

export function fetchApiManagementOverview() {
  return readJson<ApiManagementOverview>('/api/api-management/overview', undefined, {
    email: { total: 0, active: 0, warmed: 0, eligible: 0, remainingQuota: 0 },
    whatsapp: { total: 0, active: 0, connected: 0, eligible: 0, remainingQuota: 0 },
  })
}

export function fetchApiRequests(limit = 50) {
  return readJson<ApiDispatchRequestRecord[]>(`/api/api-management/requests?limit=${limit}`, undefined, [])
}

export function createApiKey(body: { name: string }) {
  return fetch('/api/api-management/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function revokeApiKey(id: string) {
  return fetch(`/api/api-management/keys?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
