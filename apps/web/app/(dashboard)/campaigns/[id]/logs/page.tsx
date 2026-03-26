'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { StatusBadge } from '@/components/shared/StatusBadge'

type Channel = 'EMAIL' | 'WHATSAPP'

interface CampaignMeta {
  name: string
  channel: Channel
}

interface EmailLog {
  id: string
  toEmail: string
  subject: string
  status: 'sent' | 'failed' | 'bounced'
  sentAt: string
  errorMessage: string | null
  mailAccount: { id: string; email: string; displayName: string }
}

interface WhatsAppLog {
  id: string
  toPhone: string
  message: string
  status: 'sent' | 'failed'
  sentAt: string
  errorMessage: string | null
  whatsappAccount: { id: string; displayName: string; phoneNumber: string | null }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CampaignLogsPage({ params }: { params: { id: string } }) {
  const campaignId = params.id
  const [campaign, setCampaign] = useState<CampaignMeta>({ name: 'Loading...', channel: 'EMAIL' })
  const [logs, setLogs] = useState<Array<EmailLog | WhatsAppLog>>([])
  const [counts, setCounts] = useState({ sent: 0, failed: 0, bounced: 0 })
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', page: 1 })

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.name) {
          setCampaign({
            name: data.name,
            channel: data.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL',
          })
        } else {
          setCampaign({ name: 'Unknown Campaign', channel: 'EMAIL' })
        }
      })
      .catch(() => setCampaign({ name: 'Unknown Campaign', channel: 'EMAIL' }))
  }, [campaignId])

  useEffect(() => {
    setLoading(true)
    const urlParams = new URLSearchParams()
    urlParams.append('campaignId', campaignId)
    urlParams.append('channel', campaign.channel === 'WHATSAPP' ? 'whatsapp' : 'email')
    if (filters.status) urlParams.append('status', filters.status)
    urlParams.append('page', String(filters.page))

    fetch(`/api/sent?${urlParams.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(Array.isArray(data.logs) ? data.logs : [])
        setCounts(data.counts || { sent: 0, failed: 0, bounced: 0 })
        setTotal(data.total || 0)
        setPages(data.pages || 1)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [filters, campaignId, campaign.channel])

  const handleExport = () => {
    const urlParams = new URLSearchParams()
    urlParams.append('campaignId', campaignId)
    urlParams.append('channel', campaign.channel === 'WHATSAPP' ? 'whatsapp' : 'email')
    if (filters.status) urlParams.append('status', filters.status)
    urlParams.append('export', 'csv')
    window.open(`/api/sent?${urlParams.toString()}`)
  }

  const isWhatsApp = campaign.channel === 'WHATSAPP'

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            <Link href="/campaigns" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Campaigns</Link>
            {' / '}
            <Link href={`/campaigns/${campaignId}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{campaign.name}</Link>
            {' / '}
            <span style={{ color: 'var(--text-secondary)' }}>Logs</span>
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            {isWhatsApp ? 'WhatsApp Delivery Logs' : 'Email Delivery Logs'}
          </h1>
        </div>
        <button className="btn-primary" onClick={handleExport}>Export CSV</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' }}>
        <div className="glass-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)' }}>{total.toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total</div>
        </div>
        <div className="glass-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--success)' }}>{counts.sent.toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Sent</div>
        </div>
        <div className="glass-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--error)' }}>{counts.failed.toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Failed</div>
        </div>
        <div className="glass-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--warning)' }}>{counts.bounced.toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Bounced</div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '14px', marginBottom: '18px', display: 'flex', gap: '10px' }}>
        <select
          className="input-base"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
          style={{ width: 180 }}
        >
          <option value="">All Status</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          {!isWhatsApp ? <option value="bounced">Bounced</option> : null}
        </select>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {isWhatsApp ? 'Recipient Phone' : 'Recipient Email'}
                </th>
                <th style={{ padding: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {isWhatsApp ? 'Message' : 'Subject'}
                </th>
                <th style={{ padding: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>Sender</th>
                <th style={{ padding: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>Date</th>
                <th style={{ padding: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: '38px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '38px', textAlign: 'center', color: 'var(--text-muted)' }}>No logs found</td></tr>
              ) : (
                logs.map((log) => {
                  const recipient = isWhatsApp ? (log as WhatsAppLog).toPhone : (log as EmailLog).toEmail
                  const content = isWhatsApp ? (log as WhatsAppLog).message : (log as EmailLog).subject
                  const sender = isWhatsApp
                    ? ((log as WhatsAppLog).whatsappAccount.phoneNumber || (log as WhatsAppLog).whatsappAccount.displayName)
                    : (log as EmailLog).mailAccount.email
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '14px', fontSize: '13px', color: 'var(--text-primary)' }}>{recipient}</td>
                      <td style={{ padding: '14px', fontSize: '13px', color: 'var(--text-secondary)', maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{content}</td>
                      <td style={{ padding: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>{sender}</td>
                      <td style={{ padding: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>{formatDate(log.sentAt)}</td>
                      <td style={{ padding: '14px' }}>
                        <StatusBadge status={log.status} />
                        {log.errorMessage ? <div style={{ fontSize: '11px', color: 'var(--error)', marginTop: '4px' }}>{log.errorMessage}</div> : null}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Page {filters.page} of {pages}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-ghost" disabled={filters.page === 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
                Previous
              </button>
              <button className="btn-ghost" disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
