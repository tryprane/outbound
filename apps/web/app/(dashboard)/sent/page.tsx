'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PaginationControls } from '@/components/ui/pagination-controls'

interface MailLog {
  id: string
  campaign: { id: string; name: string } | null
  apiDispatchRequest?: { id: string; apiKey: { name: string } } | null
  mailAccount: { id: string; email: string; displayName: string }
  toEmail: string
  subject: string
  status: 'sent' | 'failed' | 'bounced'
  sentAt: string
  openedAt: string | null
  lastOpenedAt: string | null
  openCount: number
  repliedAt: string | null
  replyCount: number
  complaintCount: number
  complainedAt: string | null
  errorMessage: string | null
}

interface ReplyMessage {
  id: string
  fromEmail: string | null
  subject: string | null
  snippet: string | null
  sentAt: string | null
  receivedAt: string | null
  createdAt: string
}

interface ReplyModalState {
  sentMailId: string
  recipient: string
  subject: string
  replyCount: number
  repliedAt: string | null
  replies: ReplyMessage[]
}

type SentFilterAccount = {
  id: string
  email: string
  displayName: string
  dailyLimit: number
  sentToday: number
  isActive: boolean
  warmupStatus: 'COLD' | 'WARMING' | 'WARMED' | 'PAUSED'
  mailboxSyncStatus: 'idle' | 'syncing' | 'error'
}

type SentProgressAccount = SentFilterAccount & {
  mailboxHealthScore: number
  mailboxHealthStatus: string
}

interface CampaignsAndAccounts {
  campaigns: { id: string; name: string; channel: 'EMAIL' | 'WHATSAPP' }[]
  accounts: SentFilterAccount[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function GlobalSentMailPage() {
  const [logs, setLogs] = useState<MailLog[]>([])
  const [counts, setCounts] = useState({
    sent: 0,
    failed: 0,
    bounced: 0,
    complaints: 0,
    opened: 0,
    unopened: 0,
    openRate: 0,
    replied: 0,
    unreplied: 0,
    replyRate: 0,
  })
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [limit, setLimit] = useState(50)
  
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const [replyModal, setReplyModal] = useState<ReplyModalState | null>(null)
  const [replyLoadingId, setReplyLoadingId] = useState<string | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [accountProgressExpanded, setAccountProgressExpanded] = useState(false)
  const [accountProgressLoading, setAccountProgressLoading] = useState(false)
  const [accountProgressLoaded, setAccountProgressLoaded] = useState(false)
  const [accountProgressError, setAccountProgressError] = useState<string | null>(null)
  const [accountProgressAccounts, setAccountProgressAccounts] = useState<SentProgressAccount[]>([])
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
  const selectedAccount = useMemo(
    () => options.accounts.find((account) => account.id === filters.mailAccountId) || null,
    [filters.mailAccountId, options.accounts]
  )

  const visibleLogCount = logs.length

  function formatAccountOptionLabel(account: CampaignsAndAccounts['accounts'][number]) {
    const activity = account.isActive ? account.warmupStatus : 'INACTIVE'
    return `${account.email} - ${account.sentToday}/${account.dailyLimit} - ${activity} - sync ${account.mailboxSyncStatus}`
  }

  function formatReplyTimestamp(message: ReplyMessage) {
    return formatDate(message.receivedAt || message.sentAt || message.createdAt)
  }

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    // Fetch dropdown options once
    Promise.all([
      fetch('/api/campaigns?page=1&limit=100').then(r => r.json()),
      fetch('/api/mail-accounts?resource=sent-filter-options&page=1&limit=100').then(r => r.json()),
    ]).then(([camps, accs]) => {
      setOptions({
        campaigns: Array.isArray(camps?.items)
          ? camps.items
              .filter((c: any) => c.channel === 'EMAIL')
              .map((c: any) => ({ id: c.id, name: c.name, channel: c.channel }))
          : [],
        accounts: Array.isArray(accs?.items) ? accs.items : [],
      })
    })
  }, [])

  const fetchAccountProgress = async () => {
    setAccountProgressLoading(true)
    setAccountProgressError(null)

    try {
      const response = await fetch('/api/mail-accounts?resource=sent-progress&page=1&limit=100')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load account progress')
      }

      setAccountProgressAccounts(Array.isArray(data?.items) ? data.items : [])
      setAccountProgressLoaded(true)
    } catch (error) {
      setAccountProgressError(error instanceof Error ? error.message : 'Failed to load account progress')
    } finally {
      setAccountProgressLoading(false)
    }
  }

  const handleToggleAccountProgress = () => {
    setAccountProgressExpanded((current) => {
      const next = !current
      if (next && !accountProgressLoaded && !accountProgressLoading) {
        void fetchAccountProgress()
      }
      return next
    })
  }

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
    params.append('limit', limit.toString())

    fetch(`/api/sent?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        setLogs(data.logs || [])
        setCounts(data.counts || {
          sent: 0,
          failed: 0,
          bounced: 0,
          complaints: 0,
          opened: 0,
          unopened: 0,
          openRate: 0,
          replied: 0,
          unreplied: 0,
          replyRate: 0,
        })
        setTotal(data.total || 0)
        setPages(data.pages || 1)
        setLimit(data.limit || limit)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchLogs()
  }, [filters, limit]) // eslint-disable-line

  const handleLogAction = async (sentMailId: string, action: 'mark-bounced' | 'mark-complaint' | 'clear-complaint-log') => {
    const res = await fetch('/api/sent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentMailId, action }),
    })
    if (!res.ok) {
      return
    }
    fetchLogs()
  }

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

  const handleOpenReplyModal = async (log: MailLog) => {
    setReplyError(null)
    setReplyLoadingId(log.id)

    try {
      const res = await fetch(`/api/sent/${log.id}/reply`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load reply details')
      }

      setReplyModal({
        sentMailId: log.id,
        recipient: log.toEmail,
        subject: log.subject.replace(/^Subject:\s*/i, ''),
        replyCount: data.replyCount || 0,
        repliedAt: data.repliedAt || null,
        replies: Array.isArray(data.replies) ? data.replies : [],
      })
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : 'Failed to load reply details')
    } finally {
      setReplyLoadingId(null)
    }
  }

  useEffect(() => {
    if (!replyModal) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setReplyModal(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [replyModal])

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
        <div className="glass-card" style={{ flex: 1, padding: '24px', borderTop: '3px solid #f97316' }}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#f97316' }}>{counts.complaints.toLocaleString()}</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Complaints</div>
        </div>
        <div className="glass-card" style={{ flex: 1, padding: '24px', borderTop: '3px solid #0f766e' }}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#0f766e' }}>{counts.replied.toLocaleString()}</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Replied</div>
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
          <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Awaiting reply</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f766e' }}>{counts.unreplied.toLocaleString()}</div>
          </div>
          <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Reply rate</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f766e' }}>{counts.replyRate}%</div>
          </div>
        </div>
        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Open tracking is best-effort and depends on the recipient client loading remote images. Reply tracking is inferred from synced mailbox threads.
        </div>
      </div>

      <div className="glass-card" style={{ marginBottom: '24px', overflow: 'hidden' }}>
        <button
          type="button"
          onClick={handleToggleAccountProgress}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            padding: '20px 24px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
          aria-expanded={accountProgressExpanded}
        >
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Account Sending Progress</div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Expand to load sender account progress, warmup status, sync state, and remaining daily capacity.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '999px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              flexShrink: 0,
            }}
          >
            <ChevronDown
              size={18}
              style={{
                transform: accountProgressExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            />
          </div>
        </button>

        {accountProgressExpanded ? (
          <div style={{ padding: '0 24px 24px', borderTop: '1px solid var(--border)' }}>
            {accountProgressLoading ? (
              <div style={{ paddingTop: '18px', fontSize: '14px', color: 'var(--text-muted)' }}>
                Loading sender account progress...
              </div>
            ) : accountProgressError ? (
              <div style={{ paddingTop: '18px', fontSize: '14px', color: 'var(--error)' }}>
                {accountProgressError}
              </div>
            ) : accountProgressAccounts.length === 0 ? (
              <div style={{ paddingTop: '18px', fontSize: '14px', color: 'var(--text-muted)' }}>
                No sender accounts available yet.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '18px' }}>
                  {accountProgressAccounts.map((account) => {
                    const progress = Math.min(100, ((account.sentToday || 0) / (account.dailyLimit || 1)) * 100)
                    const isNearLimit = progress >= 90

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

                <div style={{ display: 'grid', gap: '10px', marginTop: '18px' }}>
                  {accountProgressAccounts.map((account) => (
                    <div key={`${account.id}-details`} style={{ display: 'grid', gap: '6px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{account.email}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{account.displayName || 'No display name set'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <StatusBadge status={account.isActive ? 'active' : 'paused'} />
                          <StatusBadge status={account.mailboxSyncStatus} />
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Daily limit {account.sentToday}/{account.dailyLimit} | Warmup {account.warmupStatus} | Health {account.mailboxHealthScore}/100 ({account.mailboxHealthStatus})
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

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
            {options.accounts.map(a => <option key={a.id} value={a.id}>{formatAccountOptionLabel(a)}</option>)}
          </select>
          {selectedAccount ? (
            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
              {selectedAccount.sentToday}/{selectedAccount.dailyLimit} sent today | {selectedAccount.isActive ? selectedAccount.warmupStatus : 'INACTIVE'} | sync {selectedAccount.mailboxSyncStatus}
            </div>
          ) : null}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Showing {visibleLogCount.toLocaleString()} of {total.toLocaleString()} sent mail logs
          </div>
          {pages > 0 ? (
            <PaginationControls
              page={filters.page}
              pages={pages}
              total={total}
              limit={limit}
              onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
              onLimitChange={(value) => {
                setLimit(value)
                setFilters((current) => ({ ...current, page: 1 }))
              }}
              label="sent logs"
            />
          ) : null}
        </div>
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
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Open / Reply</th>
                <th style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No emails found matching filters</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} className="hover:bg-[var(--bg-hover)]">
                    <td style={{ padding: '16px', fontSize: '14px', color: 'var(--text-primary)' }}>{log.toEmail}</td>
                    <td style={{ padding: '16px', fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.subject.replace(/^Subject:\s*/i, '')}
                    </td>
                    <td style={{ padding: '16px', fontSize: '13px' }}>
                      {log.campaign ? (
                        <Link href={`/campaigns/${log.campaign.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                          {log.campaign.name}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>
                          API {log.apiDispatchRequest?.apiKey.name || 'request'}
                        </span>
                      )}
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
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <StatusBadge status={log.openedAt ? 'opened' : 'unopened'} />
                          <StatusBadge status={log.repliedAt ? 'replied' : 'awaiting reply'} />
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>N/A</span>
                      )}
                      {log.status === 'sent' && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {log.openedAt ? `Opened ${formatDate(log.openedAt)}` : 'Not opened yet'}
                          {log.openCount > 1 ? ` | ${log.openCount} views` : ''}
                          {log.repliedAt ? ` | Replied ${formatDate(log.repliedAt)}` : ''}
                          {log.replyCount > 1 ? ` | ${log.replyCount} replies` : ''}
                        </div>
                      )}
                      {log.repliedAt ? (
                        <button
                          className="btn-ghost"
                          style={{ marginTop: '8px', padding: '6px 10px', fontSize: '12px' }}
                          onClick={() => void handleOpenReplyModal(log)}
                          disabled={replyLoadingId === log.id}
                        >
                          {replyLoadingId === log.id ? 'Loading reply...' : 'View reply'}
                        </button>
                      ) : null}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px' }}>
                        {log.complaintCount > 0 ? (
                          <div style={{ fontSize: '11px', color: '#f97316' }}>
                            Complaint logged {log.complainedAt ? formatDate(log.complainedAt) : ''}
                          </div>
                        ) : null}
                        {log.complaintCount > 0 ? (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Clearing the log does not remove suppression.
                          </div>
                        ) : null}
                        <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => void handleLogAction(log.id, 'mark-complaint')}>
                          Mark complaint
                        </button>
                        <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => void handleLogAction(log.id, 'mark-bounced')}>
                          Mark bounced
                        </button>
                        {log.complaintCount > 0 ? (
                          <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => void handleLogAction(log.id, 'clear-complaint-log')}>
                            Clear complaint log
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 0 && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <PaginationControls
              page={filters.page}
              pages={pages}
              total={total}
              limit={limit}
              onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
              onLimitChange={(value) => {
                setLimit(value)
                setFilters((current) => ({ ...current, page: 1 }))
              }}
              label="sent logs"
            />
          </div>
        )}
      </div>

      {replyError ? (
        <div className="glass-card" style={{ marginTop: '16px', padding: '14px', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--error)' }}>
          {replyError}
        </div>
      ) : null}

      {isClient && replyModal ? createPortal(
        <div
          onClick={() => setReplyModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 90,
          }}
        >
          <div
            className="glass-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(760px, 100%)',
              maxHeight: 'min(80vh, 920px)',
              overflowY: 'auto',
              padding: '24px',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  Reply thread
                </div>
                <h2 style={{ marginTop: '6px', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {replyModal.subject || '(no subject)'}
                </h2>
                <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Recipient {replyModal.recipient} | {replyModal.replyCount} {replyModal.replyCount === 1 ? 'reply' : 'replies'}
                  {replyModal.repliedAt ? ` | First reply ${formatDate(replyModal.repliedAt)}` : ''}
                </div>
              </div>
              <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setReplyModal(null)}>
                Close
              </button>
            </div>

            {replyModal.replies.length === 0 ? (
              <div style={{ padding: '18px', borderRadius: '12px', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                Reply tracking found a reply event, but no synced reply snippet is available yet. Refresh after the next mailbox sync if needed.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '14px' }}>
                {replyModal.replies.map((reply, index) => (
                  <div
                    key={reply.id}
                    style={{
                      padding: '18px',
                      borderRadius: '16px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Reply {index + 1}
                        </div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          From {reply.fromEmail || 'Unknown sender'}
                        </div>
                        {reply.subject ? (
                          <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                            Subject {reply.subject.replace(/^Subject:\s*/i, '')}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {formatReplyTimestamp(reply)}
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: '14px',
                        padding: '14px',
                        borderRadius: '12px',
                        background: 'rgba(255,255,255,0.7)',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        whiteSpace: 'pre-wrap',
                        border: '1px solid rgba(15, 23, 42, 0.06)',
                      }}
                    >
                      {reply.snippet || 'No synced reply preview available for this message yet.'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      , document.body) : null}

    </div>
  )
}
