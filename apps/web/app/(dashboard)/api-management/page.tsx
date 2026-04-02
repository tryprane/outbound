'use client'

import { useEffect, useState } from 'react'
import {
  createApiKey,
  fetchApiKeys,
  fetchApiManagementOverview,
  fetchApiRequests,
  revokeApiKey,
} from '@/lib/apiManagementClient'
import type {
  ApiDispatchRequestRecord,
  ApiKeyRecord,
  ApiManagementOverview,
} from '@/components/api-management/types'

function formatDate(value: string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusColor(status: ApiDispatchRequestRecord['status']) {
  if (status === 'SENT') return 'var(--success)'
  if (status === 'FAILED' || status === 'REJECTED_NO_CAPACITY') return 'var(--error)'
  if (status === 'PROCESSING') return 'var(--warning)'
  return 'var(--accent)'
}

export default function ApiManagementPage() {
  const [overview, setOverview] = useState<ApiManagementOverview | null>(null)
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [requests, setRequests] = useState<ApiDispatchRequestRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [keyName, setKeyName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastCreatedKey, setLastCreatedKey] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    const [overviewResult, keysResult, requestsResult] = await Promise.all([
      fetchApiManagementOverview(),
      fetchApiKeys(),
      fetchApiRequests(),
    ])
    setOverview(overviewResult)
    setKeys(keysResult)
    setRequests(requestsResult)
    setLoading(false)
  }

  useEffect(() => {
    void loadAll()
  }, [])

  async function handleCreateKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!keyName.trim()) return
    setSubmitting(true)
    try {
      const response = await createApiKey({ name: keyName.trim() })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create API key')
      }
      setLastCreatedKey(data.plaintextKey || null)
      setKeyName('')
      await loadAll()
    } catch (error) {
      setLastCreatedKey(error instanceof Error ? error.message : 'Failed to create API key')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevokeKey(id: string) {
    const response = await revokeApiKey(id)
    if (response.ok) {
      await loadAll()
    }
  }

  async function copyLastKey() {
    if (!lastCreatedKey) return
    await navigator.clipboard.writeText(lastCreatedKey)
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            API Management
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '760px' }}>
            Manage workspace API keys, monitor pooled sender readiness, and inspect recent developer API traffic for email and WhatsApp.
          </p>
        </div>
        <button className="btn-ghost" onClick={() => void loadAll()}>
          Refresh
        </button>
      </div>

      {lastCreatedKey ? (
        <div className="glass-card" style={{ padding: '18px', border: '1px solid rgba(34,211,165,0.35)' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            New API key. This value is only shown once.
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-secondary)', color: 'var(--success)' }}>
              {lastCreatedKey}
            </code>
            <button className="btn-primary" onClick={() => void copyLastKey()}>
              Copy key
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Email eligible senders</div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--accent)' }}>{overview?.email.eligible ?? 0}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px' }}>
            {overview?.email.active ?? 0} active, {overview?.email.warmed ?? 0} warmed, {overview?.email.remainingQuota ?? 0} quota left today
          </div>
        </div>
        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>WhatsApp eligible senders</div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--accent)' }}>{overview?.whatsapp.eligible ?? 0}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px' }}>
            {overview?.whatsapp.connected ?? 0} connected, {overview?.whatsapp.active ?? 0} active, {overview?.whatsapp.remainingQuota ?? 0} quota left today
          </div>
        </div>
        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Active API keys</div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--accent)' }}>{keys.filter((key) => key.isActive).length}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px' }}>
            {keys.length} total keys managed in this workspace
          </div>
        </div>
        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Recent API requests</div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--accent)' }}>{requests.length}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px' }}>
            {requests.filter((request) => request.status === 'SENT').length} sent, {requests.filter((request) => request.status === 'FAILED' || request.status === 'REJECTED_NO_CAPACITY').length} failed
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 420px) minmax(420px, 1fr)', gap: '20px' }}>
        <div className="glass-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>API keys</h2>
          <form onSubmit={handleCreateKey} style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
            <input
              className="input-base"
              value={keyName}
              onChange={(event) => setKeyName(event.target.value)}
              placeholder="Integration name"
            />
            <button className="btn-primary" type="submit" disabled={submitting || !keyName.trim()}>
              {submitting ? 'Creating...' : 'Create key'}
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loading ? (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading keys...</div>
            ) : keys.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No API keys created yet.</div>
            ) : (
              keys.map((key) => (
                <div key={key.id} style={{ padding: '14px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{key.name}</div>
                    <span style={{ fontSize: '11px', color: key.isActive ? 'var(--success)' : 'var(--error)' }}>
                      {key.isActive ? 'ACTIVE' : 'REVOKED'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{key.keyPrefix}...</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Created {formatDate(key.createdAt)} | Last used {formatDate(key.lastUsedAt)} | {key._count.apiDispatchRequests} requests
                  </div>
                  {key.isActive ? (
                    <button className="btn-ghost" style={{ marginTop: '10px' }} onClick={() => void handleRevokeKey(key.id)}>
                      Revoke
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>Integration docs</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>POST /api/v1/email/send</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>{`curl -X POST "$BASE_URL/api/v1/email/send" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"lead@example.com","subject":"Quick intro","html":"<p>Hello there</p>"}'`}</pre>
            </div>
            <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>POST /api/v1/whatsapp/send</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>{`curl -X POST "$BASE_URL/api/v1/whatsapp/send" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"toPhone":"+919999999999","message":"Hi, sharing a quick note."}'`}</pre>
            </div>
            <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>GET /api/v1/requests/:id</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>{`curl "$BASE_URL/api/v1/requests/REQUEST_ID" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</pre>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>Recent API requests</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Created</th>
                <th style={{ padding: '12px' }}>Channel</th>
                <th style={{ padding: '12px' }}>Recipient</th>
                <th style={{ padding: '12px' }}>API key</th>
                <th style={{ padding: '12px' }}>Selected sender</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading API requests...</td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px', color: 'var(--text-muted)' }}>No API requests yet.</td>
                </tr>
              ) : (
                requests.map((request) => {
                  const sender =
                    request.channel === 'EMAIL'
                      ? request.selectedMailAccount?.email || 'Pending selection'
                      : request.selectedWhatsAppAccount?.phoneNumber || request.selectedWhatsAppAccount?.displayName || 'Pending selection'

                  return (
                    <tr key={request.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>{formatDate(request.createdAt)}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--text-primary)' }}>{request.channel}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--text-primary)' }}>{request.requestedTo}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>{request.apiKey.name}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>{sender}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: statusColor(request.status) }}>{request.status}</span>
                      </td>
                      <td style={{ padding: '12px', fontSize: '12px', color: request.errorMessage ? 'var(--error)' : 'var(--text-secondary)', maxWidth: '320px' }}>
                        {request.errorMessage || request.providerMessageId || request.subject || 'Queued'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
