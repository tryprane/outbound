'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { StatusBadge } from '@/components/shared/StatusBadge'

interface MailLog {
  id: string
  campaign: { id: string; name: string }
  mailAccount: { id: string; email: string; displayName: string }
  toEmail: string
  subject: string
  status: 'sent' | 'failed' | 'bounced'
  sentAt: string
  openedAt: string | null
  lastOpenedAt: string | null
  openCount: number
  errorMessage: string | null
}

interface CampaignsAndAccounts {
  campaigns: { id: string; name: string; channel: 'EMAIL' | 'WHATSAPP' }[]
  accounts: { id: string; email: string; dailyLimit: number; sentToday: number }[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function GlobalSentMailPage() {
  const [logs, setLogs] = useState<MailLog[]>([])
  const [counts, setCounts] = useState({ sent: 0, failed: 0, bounced: 0, opened: 0, unopened: 0, openRate: 0 })
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    campaignId: '',
    mailAccountId: '',
    status: '',
    from: '',
    to: '',
    page: 1,
  })

  // Dropdowns for filters
  const [options, setOptions] = useState<CampaignsAndAccounts>({ campaigns: [], accounts: [] })

  useEffect(() => {
    // Fetch dropdown options once
    Promise.all([
      fetch('/api/campaigns').then(r => r.json()),
      fetch('/api/mail-accounts').then(r => r.json()),
    ]).then(([camps, accs]) => {
      setOptions({
        campaigns: Array.isArray(camps)
          ? camps
              .filter((c: any) => c.channel === 'EMAIL')
              .map((c: any) => ({ id: c.id, name: c.name, channel: c.channel }))
          : [],
        accounts: Array.isArray(accs) ? accs : [],
      })
    })
  }, [])

  const fetchLogs = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.campaignId) params.append('campaignId', filters.campaignId)
    if (filters.mailAccountId) params.append('mailAccountId', filters.mailAccountId)
    if (filters.status) params.append('status', filters.status)
    if (filters.from) params.append('from', filters.from)
    if (filters.to) params.append('to', filters.to)
    params.append('channel', 'email')
    params.append('page', filters.page.toString())

    fetch(`/api/sent?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        setLogs(data.logs || [])
        setCounts(data.counts || { sent: 0, failed: 0, bounced: 0, opened: 0, unopened: 0, openRate: 0 })
        setTotal(data.total || 0)
        setPages(data.pages || 1)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchLogs()
  }, [filters]) // eslint-disable-line

  const handleExport = () => {
    const params = new URLSearchParams()
    if (filters.campaignId) params.append('campaignId', filters.campaignId)
    if (filters.mailAccountId) params.append('mailAccountId', filters.mailAccountId)
    if (filters.status) params.append('status', filters.status)
    if (filters.from) params.append('from', filters.from)
    if (filters.to) params.append('to', filters.to)
    params.append('channel', 'email')
    params.append('export', 'csv')
    window.open(`/api/sent?${params.toString()}`)
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Sent Mail Analytics
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Global overview of all outbound emails across all campaigns
          </p>
        </div>
        <button className="btn-primary" onClick={handleExport}>
          📥 Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="glass-card" style={{ flex: 1, padding: '24px', borderTop: '3px solid var(--accent)' }}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--accent)' }}>{total.toLocaleString()}</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Total Logs</div>
        </div>
        <div className="glass-card" style={{ flex: 1, padding: '24px', borderTop: '3px solid var(--success)' }}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--success)' }}>{counts.sent.toLocaleString()}</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Sent</div>
        </div>
        <div className="glass-card" style={{ flex: 1, padding: '24px', borderTop: '3px solid var(--error)' }}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--error)' }}>{counts.failed.toLocaleString()}</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Failed</div>
        </div>
        <div className="glass-card" style={{ flex: 1, padding: '24px', borderTop: '3px solid var(--warning)' }}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--warning)' }}>{counts.bounced.toLocaleString()}</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Bounced</div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '18px', marginBottom: '32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', alignItems: 'stretch' }}>
          <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Opened</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success)' }}>{counts.opened.toLocaleString()}</div>
          </div>
          <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Not opened</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--warning)' }}>{counts.unopened.toLocaleString()}</div>
          </div>
          <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Open rate</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{counts.openRate}%</div>
          </div>
        </div>
        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Open tracking is best-effort and depends on the recipient client loading remote images.
        </div>
      </div>

      {/* Account Progress Table */}
      {options.accounts.length > 0 && (
        <div className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>Account Sending Progress</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {options.accounts.map(account => {
              const progress = Math.min(100, ((account.sentToday || 0) / (account.dailyLimit || 1)) * 100);
              const isNearLimit = progress >= 90;
              
              return (
                <div key={account.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                  <div style={{ width: '250px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{account.email}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: isNearLimit ? 'var(--warning)' : 'var(--accent)', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                  <div style={{ width: '80px', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                    {account.sentToday || 0} / {account.dailyLimit || 0}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Campaign</label>
          <select 
            className="input-base" 
            value={filters.campaignId} 
            onChange={e => setFilters(f => ({ ...f, campaignId: e.target.value, page: 1 }))}
          >
            <option value="">All Campaigns</option>
            {options.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Sender Account</label>
          <select 
            className="input-base" 
            value={filters.mailAccountId} 
            onChange={e => setFilters(f => ({ ...f, mailAccountId: e.target.value, page: 1 }))}
          >
            <option value="">All Accounts</option>
            {options.accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
          </select>
        </div>
        <div style={{ width: '140px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Status</label>
          <select 
            className="input-base" 
            value={filters.status} 
            onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}
          >
            <option value="">All Status</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="bounced">Bounced</option>
          </select>
        </div>
        <div style={{ width: '150px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>From Date</label>
          <input 
            type="date" 
            className="input-base" 
            value={filters.from}
            onChange={e => setFilters(f => ({ ...f, from: e.target.value, page: 1 }))}
          />
        </div>
        <div style={{ width: '150px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>To Date</label>
          <input 
            type="date" 
            className="input-base" 
            value={filters.to}
            onChange={e => setFilters(f => ({ ...f, to: e.target.value, page: 1 }))}
          />
        </div>
        {(filters.campaignId || filters.mailAccountId || filters.status || filters.from || filters.to) && (
          <button 
            className="btn-ghost" 
            onClick={() => setFilters({ campaignId: '', mailAccountId: '', status: '', from: '', to: '', page: 1 })}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Recipient</th>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Subject</th>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Campaign</th>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Sender</th>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Date</th>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Open</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No emails found matching filters</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} className="hover:bg-[var(--bg-hover)]">
                    <td style={{ padding: '16px', fontSize: '14px', color: 'var(--text-primary)' }}>{log.toEmail}</td>
                    <td style={{ padding: '16px', fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.subject.replace(/^Subject:\s*/i, '')}
                    </td>
                    <td style={{ padding: '16px', fontSize: '13px' }}>
                      <Link href={`/campaigns/${log.campaign.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                        {log.campaign.name}
                      </Link>
                    </td>
                    <td style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>{log.mailAccount.email}</td>
                    <td style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>{formatDate(log.sentAt)}</td>
                    <td style={{ padding: '16px' }}>
                      <StatusBadge status={log.status} />
                      {log.errorMessage && (
                        <div style={{ fontSize: '11px', color: 'var(--error)', marginTop: '4px', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.errorMessage}>
                          {log.errorMessage}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px' }}>
                      {log.status === 'sent' ? (
                        <StatusBadge status={log.openedAt ? 'opened' : 'unopened'} />
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>N/A</span>
                      )}
                      {log.status === 'sent' && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {log.openedAt ? `Opened ${formatDate(log.openedAt)}` : 'Not opened yet'}
                          {log.openCount > 1 ? ` | ${log.openCount} views` : ''}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Showing page {filters.page} of {pages}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn-ghost" 
                style={{ padding: '6px 12px', fontSize: '13px' }}
                disabled={filters.page === 1}
                onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
              >
                Previous
              </button>
              <button 
                className="btn-ghost" 
                style={{ padding: '6px 12px', fontSize: '13px' }}
                disabled={filters.page >= pages}
                onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
