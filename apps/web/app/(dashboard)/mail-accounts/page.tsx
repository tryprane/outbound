'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { ZohoAccountForm } from '@/components/mail-accounts/ZohoAccountForm'
import { GmailOAuthButton } from '@/components/mail-accounts/GmailOAuthButton'

interface MailAccount {
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
  warmupStats7d: {
    total: number
    sent: number
    failed: number
    bounced: number
    successRate: number
  }
  _count: { sentMails: number }
}

interface WhatsAppAccount {
  id: string
  displayName: string
  phoneNumber: string | null
  isActive: boolean
  connectionStatus: 'DISCONNECTED' | 'QR_PENDING' | 'CONNECTED' | 'ERROR'
  lastQr: string | null
  lastError: string | null
  dailyLimit: number
  sentToday: number
  _count: { sentMessages: number }
}

interface WarmupRecipient {
  id: string
  email: string
  name: string | null
  isActive: boolean
  isSystem: boolean
  mailAccountId: string | null
  createdAt: string
}

interface WarmupOverview {
  total: number
  warming: number
  warmed: number
  cold: number
  paused: number
  autoEnabled: number
  activeMailboxes: number
}

interface WarmupLog {
  id: string
  senderMailAccountId: string
  recipientEmail: string
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

type ActiveTab = 'accounts' | 'warmup' | 'add-zoho' | 'add-gmail' | 'add-whatsapp'

function MailAccountsPageContent() {
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<MailAccount[]>([])
  const [whatsappAccounts, setWhatsappAccounts] = useState<WhatsAppAccount[]>([])
  const [warmupRecipients, setWarmupRecipients] = useState<WarmupRecipient[]>([])
  const [warmupOverview, setWarmupOverview] = useState<WarmupOverview | null>(null)
  const [warmupLogs, setWarmupLogs] = useState<WarmupLog[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('accounts')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const [waForm, setWaForm] = useState({ displayName: '', phoneNumber: '', dailyLimit: 40 })
  const [waSaving, setWaSaving] = useState(false)
  const [recipientForm, setRecipientForm] = useState({ email: '', name: '', isActive: true })
  const [recipientSaving, setRecipientSaving] = useState(false)

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    if (success) showToast('success', decodeURIComponent(success))
    if (error) showToast('error', decodeURIComponent(error))
  }, [searchParams])

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const loadAll = useCallback(async (background = false) => {
    if (!background) setLoading(true)
    const [mailRes, waRes, recipientRes, overviewRes, logsRes] = await Promise.all([
      fetch('/api/mail-accounts').then((r) => r.json()).catch(() => []),
      fetch('/api/mail-accounts?resource=whatsapp-accounts').then((r) => r.json()).catch(() => []),
      fetch('/api/mail-accounts?resource=warmup-recipients').then((r) => r.json()).catch(() => []),
      fetch('/api/mail-accounts?resource=warmup-overview').then((r) => r.json()).catch(() => null),
      fetch('/api/mail-accounts?resource=warmup-logs&limit=25').then((r) => r.json()).catch(() => []),
    ])
    setAccounts(Array.isArray(mailRes) ? mailRes : [])
    setWhatsappAccounts(Array.isArray(waRes) ? waRes : [])
    setWarmupRecipients(Array.isArray(recipientRes) ? recipientRes : [])
    setWarmupOverview(overviewRes && typeof overviewRes === 'object' ? (overviewRes as WarmupOverview) : null)
    setWarmupLogs(Array.isArray(logsRes) ? logsRes : [])
    if (!background) setLoading(false)
  }, [])

  useEffect(() => {
    void loadAll()
    const timer = setInterval(() => void loadAll(true), 3_000)
    return () => clearInterval(timer)
  }, [loadAll])

  const handleToggleMailActive = async (id: string, current: boolean, warmupStatus: MailAccount['warmupStatus']) => {
    if (!current && warmupStatus !== 'WARMED') {
      showToast('error', 'Only WARMED mailboxes can be activated.')
      return
    }
    const res = await fetch('/api/mail-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: !current }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Update failed' }))
      showToast('error', data.error || 'Update failed')
      return
    }
    void loadAll()
  }

  const handleWarmupStatusChange = async (id: string, warmupStatus: MailAccount['warmupStatus']) => {
    const res = await fetch('/api/mail-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, warmupStatus }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to update warmup status' }))
      showToast('error', data.error || 'Failed to update warmup status')
      return
    }
    showToast('success', `Warmup status updated to ${warmupStatus}`)
    void loadAll()
  }

  const handleWarmupAutoToggle = async (id: string, current: boolean) => {
    const res = await fetch('/api/mail-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, warmupAutoEnabled: !current }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to update warmup automation' }))
      showToast('error', data.error || 'Failed to update warmup automation')
      return
    }
    void loadAll()
  }

  const handleCreateWarmupRecipient = async () => {
    if (!recipientForm.email.trim()) {
      showToast('error', 'Recipient email is required')
      return
    }
    setRecipientSaving(true)
    const res = await fetch('/api/mail-accounts?resource=warmup-recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: recipientForm.email.trim(),
        name: recipientForm.name.trim() || undefined,
        isActive: recipientForm.isActive,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      showToast('error', data.error || 'Failed to save warmup recipient')
      setRecipientSaving(false)
      return
    }
    showToast('success', 'Warmup recipient saved')
    setRecipientForm({ email: '', name: '', isActive: true })
    setRecipientSaving(false)
    void loadAll()
  }

  const handleToggleWarmupRecipient = async (id: string, current: boolean) => {
    const res = await fetch('/api/mail-accounts?resource=warmup-recipients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: !current }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to update warmup recipient' }))
      showToast('error', data.error || 'Failed to update warmup recipient')
      return
    }
    void loadAll()
  }

  const handleDeleteWarmupRecipient = async (id: string, email: string) => {
    if (!confirm(`Remove warmup recipient "${email}"?`)) return
    const res = await fetch(`/api/mail-accounts?resource=warmup-recipients&id=${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to delete warmup recipient' }))
      showToast('error', data.error || 'Failed to delete warmup recipient')
      return
    }
    showToast('success', 'Warmup recipient removed')
    void loadAll()
  }

  const handleRunWarmupNow = async (id: string) => {
    const res = await fetch('/api/mail-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, runWarmupNow: true }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to trigger warmup tick' }))
      showToast('error', data.error || 'Failed to trigger warmup tick')
      return
    }
    showToast('success', 'Warmup tick queued. Watch the logs and sent count.')
    void loadAll()
  }

  const handleDeleteMail = async (id: string, email: string) => {
    if (!confirm(`Remove ${email}?`)) return
    await fetch(`/api/mail-accounts?id=${id}`, { method: 'DELETE' })
    showToast('success', `${email} removed`)
    void loadAll()
  }

  const handleCreateWhatsapp = async () => {
    setWaSaving(true)
    const res = await fetch('/api/mail-accounts?resource=whatsapp-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: waForm.displayName,
        phoneNumber: waForm.phoneNumber || undefined,
        dailyLimit: waForm.dailyLimit,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      showToast('error', data.error || 'Failed to add WhatsApp account')
      setWaSaving(false)
      return
    }
    showToast('success', 'WhatsApp account added. Worker will generate QR shortly.')
    setWaForm({ displayName: '', phoneNumber: '', dailyLimit: 40 })
    setActiveTab('accounts')
    setWaSaving(false)
    void loadAll()
  }

  const handleToggleWhatsappActive = async (id: string, current: boolean) => {
    const res = await fetch('/api/mail-accounts?resource=whatsapp-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: !current }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to update WhatsApp account' }))
      showToast('error', data.error || 'Failed to update WhatsApp account')
      return
    }
    void loadAll()
  }

  const handleUpdateWhatsappLimit = async (id: string, dailyLimit: number) => {
    const res = await fetch('/api/mail-accounts?resource=whatsapp-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, dailyLimit }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to update limit' }))
      showToast('error', data.error || 'Failed to update limit')
      return
    }
    void loadAll()
  }

  const handleDeleteWhatsapp = async (id: string, name: string) => {
    if (!confirm(`Remove WhatsApp account "${name}"?`)) return
    await fetch(`/api/mail-accounts?resource=whatsapp-accounts&id=${id}`, { method: 'DELETE' })
    showToast('success', `${name} removed`)
    void loadAll()
  }

  const handleReconnectWhatsapp = async (id: string) => {
    const res = await fetch('/api/mail-accounts?resource=whatsapp-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reconnect: true }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to reconnect WhatsApp account' }))
      showToast('error', data.error || 'Failed to reconnect WhatsApp account')
      return
    }
    showToast('success', 'Reconnect requested. QR will refresh shortly.')
    void loadAll()
  }

  const handleReconnectGmail = () => {
    window.location.href = '/api/mail-accounts/gmail'
  }

  const warmedAccounts = accounts.filter((a) => a.warmupStatus === 'WARMED')
  const warmingAccounts = accounts.filter((a) => a.warmupStatus === 'WARMING')
  const pausedAccounts = accounts.filter((a) => a.warmupStatus === 'PAUSED')
  const autoWarmupAccounts = warmingAccounts.filter((a) => a.warmupAutoEnabled)
  const coldAccounts = accounts.filter((a) => a.warmupStatus === 'COLD')
  const connectedWhatsapp = whatsappAccounts.filter((a) => a.connectionStatus === 'CONNECTED')
  const activeCustomRecipients = warmupRecipients.filter((r) => r.isActive && !r.isSystem).length
  const activeMailboxPool = accounts.filter((a) => a.isActive).length
  const recipientPoolHealthy = activeCustomRecipients > 0 || activeMailboxPool > 1
  const pausedGmailAccounts = accounts.filter((a) => a.type === 'gmail' && a.warmupStatus === 'PAUSED')
  const gmailReconnectRequired = (account: MailAccount) =>
    account.type === 'gmail' && account.warmupStatus === 'PAUSED'
  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'warmup', label: 'Warmup' },
    { key: 'accounts', label: 'All Accounts' },
    { key: 'add-zoho', label: 'Add Zoho' },
    { key: 'add-gmail', label: 'Add Gmail' },
    { key: 'add-whatsapp', label: 'Add WhatsApp' },
  ]

  return (
    <div className="animate-fade-in">
      {toast ? (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 99, padding: '10px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border)', background: toast.type === 'success' ? 'rgba(34,211,165,0.15)' : 'rgba(239,68,68,0.15)', color: toast.type === 'success' ? 'var(--success)' : 'var(--error)' }}>
          {toast.msg}
        </div>
      ) : null}

      <div style={{ marginBottom: '22px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Sender Accounts
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Manage email warmup accounts and WhatsApp sender accounts in one place
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '10px', marginBottom: '18px' }}>
        <div className="glass-card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{accounts.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Mail accounts</div>
        </div>
        <div className="glass-card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)' }}>{warmedAccounts.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Warmed mailboxes</div>
        </div>
        <div className="glass-card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>{whatsappAccounts.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>WhatsApp accounts</div>
        </div>
        <div className="glass-card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>{connectedWhatsapp.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Connected WhatsApp</div>
        </div>
        <div className="glass-card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--warning)' }}>
            {warmupRecipients.filter((r) => r.isActive).length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Active warmup recipients</div>
        </div>
      </div>

      {pausedGmailAccounts.length > 0 ? (
        <div
          className="glass-card"
          style={{
            padding: '16px',
            marginBottom: '18px',
            border: '1px solid rgba(239,68,68,0.24)',
            background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.06))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ maxWidth: '820px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--error)', marginBottom: '6px' }}>
                Gmail reconnect needed
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                One or more Gmail mailboxes were paused because the worker hit an auth failure such as <strong>invalid_grant</strong>.
                That usually means the refresh token expired, was revoked, or needs a fresh Google OAuth consent.
              </div>
            </div>
            <button className="btn-primary" onClick={handleReconnectGmail}>
              Reconnect Gmail
            </button>
          </div>
        </div>
      ) : null}

      <div className="glass-card" style={{ padding: '16px', marginBottom: '18px', border: '1px solid rgba(59,130,246,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ maxWidth: '760px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Warmup Control Panel
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              WARMING accounts are polled every minute by the worker. Use the manual warmup tick button on an account to force
              a send and confirm the sender, queue, and log pipeline are all working.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>{warmingAccounts.length}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Warming</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--success)' }}>{autoWarmupAccounts.length}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Auto On</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--warning)' }}>{pausedAccounts.length}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Paused</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={activeTab === tab.key ? 'btn-primary' : 'btn-ghost'}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'warmup' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="glass-card" style={{ padding: '18px' }}>
            <h3 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>Warmup Overview</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
              The worker can only send warmup mail when a sender is in <strong>WARMING</strong> status, has
              <strong> Auto ON</strong>, and has at least one active recipient available. If you see "No recipient available" in the worker log,
              it means there is nobody in the warmup pool for that sender to message.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '10px', marginBottom: '14px' }}>
              <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{warmupOverview?.warming ?? warmingAccounts.length}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Warming senders</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)' }}>{warmupOverview?.warmed ?? warmedAccounts.length}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Warmed senders</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--warning)' }}>{warmupOverview?.cold ?? coldAccounts.length}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Cold senders</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{warmupOverview?.activeMailboxes ?? accounts.filter((a) => a.isActive).length}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Active mailboxes</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '10px' }}>
              <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>COLD</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Not warm yet. Mail sending should stay off.
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'rgba(99,102,241,0.08)' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>WARMING</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  The worker can send controlled warmup mail at the current stage.
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'rgba(34,197,94,0.08)' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--success)' }}>WARMED</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Warmup finished. This mailbox can be used for campaigns.
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'rgba(245,158,11,0.08)' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--warning)' }}>PAUSED</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Warmup is temporarily stopped. No jobs should be queued.
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '18px' }}>
            <h3 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '10px' }}>Recipient Health</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '10px', marginBottom: '12px' }}>
              <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>
                  {recipientPoolHealthy ? 'Healthy' : 'Needs setup'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Recipient pool</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--success)' }}>
                  {activeMailboxPool}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Active mailbox pool</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--warning)' }}>
                  {activeCustomRecipients}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Total active recipients</div>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              For each sender, the worker prefers the least-used warmup recipient. If no mailbox recipient exists, it will use active custom recipients.
            </div>
          </div>

          <div className="glass-card" style={{ padding: '18px' }}>
            <h3 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '10px' }}>Warmup Recipients</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Add at least one active recipient if you do not have another warmed mailbox to act as a system recipient.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '10px', marginBottom: '14px' }}>
              <input
                type="email"
                placeholder="recipient@example.com"
                value={recipientForm.email}
                onChange={(e) => setRecipientForm((prev) => ({ ...prev, email: e.target.value }))}
                style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
              <input
                type="text"
                placeholder="Display name"
                value={recipientForm.name}
                onChange={(e) => setRecipientForm((prev) => ({ ...prev, name: e.target.value }))}
                style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
              <button
                className="btn-primary"
                disabled={recipientSaving}
                onClick={() => void handleCreateWarmupRecipient()}
              >
                {recipientSaving ? 'Saving...' : 'Add Recipient'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={recipientForm.isActive}
                  onChange={(e) => setRecipientForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                Start active
              </label>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Active recipients can be selected by the warmup worker.
              </span>
            </div>

            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading recipients...</div>
            ) : warmupRecipients.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No warmup recipients yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {warmupRecipients.map((recipient) => (
                  <div key={recipient.id} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {recipient.name || recipient.email}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {recipient.email} {recipient.isSystem ? '(system recipient)' : '(custom recipient)'}
                        </div>
                        <div style={{ fontSize: '11px', color: recipient.isActive ? 'var(--success)' : 'var(--warning)' }}>
                          {recipient.isActive ? 'Active' : 'Inactive'}
                        </div>
                        {recipient.isSystem ? (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Managed automatically from the mailbox list.
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          className="btn-ghost"
                          disabled={recipient.isSystem}
                          onClick={() => void handleToggleWarmupRecipient(recipient.id, recipient.isActive)}
                          title={recipient.isSystem ? 'System recipients are managed automatically' : 'Enable or disable this recipient'}
                        >
                          {recipient.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ color: 'var(--error)' }}
                          disabled={recipient.isSystem}
                          onClick={() => void handleDeleteWarmupRecipient(recipient.id, recipient.email)}
                          title={recipient.isSystem ? 'System recipients cannot be deleted here' : 'Remove this recipient'}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card" style={{ padding: '18px' }}>
            <h3 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '10px' }}>Recent Warmup Mail</h3>
            {warmupLogs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No warmup mail logged yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {warmupLogs.map((log) => (
                  <div key={log.id} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {log.direction === 'reply' ? 'Reply' : 'Outbound'} | {log.status.toUpperCase()}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                          From {log.senderMailAccount.displayName} ({log.senderMailAccount.email})
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                          To {log.recipientMailAccount?.displayName || log.recipientEmail}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                          Stage {log.stage} | {new Date(log.sentAt).toLocaleString()}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                          {log.subject}
                        </div>
                        {log.errorMessage ? (
                          <div style={{ fontSize: '11px', color: 'var(--error)', marginTop: '3px' }}>
                            {log.errorMessage}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '11px', color: log.status === 'sent' ? 'var(--success)' : 'var(--warning)' }}>
                        {log.recipientType === 'system' ? 'System recipient' : 'External recipient'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === 'accounts' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="glass-card" style={{ padding: '18px' }}>
            <h3 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '10px' }}>Email Accounts</h3>
            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
            ) : accounts.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No email account connected.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {accounts.map((account) => (
                  <div key={account.id} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{account.email}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {account.type.toUpperCase()} | Warmup {account.warmupStatus} | Stage {account.warmupStage + 1}
                        </div>
                        {gmailReconnectRequired(account) ? (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              marginTop: '6px',
                              padding: '4px 8px',
                              borderRadius: '999px',
                              border: '1px solid rgba(239,68,68,0.28)',
                              background: 'rgba(239,68,68,0.1)',
                              color: 'var(--error)',
                              fontSize: '11px',
                              fontWeight: 700,
                            }}
                          >
                            Reconnect required
                          </div>
                        ) : null}
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Warmup 7d success: {account.warmupStats7d.successRate}% ({account.warmupStats7d.sent}/{account.warmupStats7d.total})
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Target daily limit: {account.recommendedDailyLimit} | Sent today: {account.sentToday}/{account.dailyLimit}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Last mail: {account.lastMailSentAt ? new Date(account.lastMailSentAt).toLocaleString() : 'Never'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Started: {account.warmupStartedAt ? new Date(account.warmupStartedAt).toLocaleString() : 'Not started'}
                          {' '}| Completed: {account.warmupCompletedAt ? new Date(account.warmupCompletedAt).toLocaleString() : 'Not completed'}
                          {' '}| Paused: {account.warmupPausedAt ? new Date(account.warmupPausedAt).toLocaleString() : 'Not paused'}
                        </div>
                        {account.type === 'gmail' && account.warmupStatus === 'PAUSED' ? (
                          <div
                            style={{
                              marginTop: '8px',
                              padding: '10px 12px',
                              borderRadius: '10px',
                              border: '1px solid rgba(239,68,68,0.24)',
                              background: 'rgba(239,68,68,0.08)',
                              color: 'var(--text-primary)',
                              fontSize: '12px',
                              lineHeight: 1.5,
                              maxWidth: '680px',
                            }}
                          >
                            Gmail warmup was paused because auth failed. Reconnect this mailbox to renew the Google token, then set it back to WARMING.
                          </div>
                        ) : null}
                        <div style={{ marginTop: '6px', width: '220px', maxWidth: '100%', height: '7px', borderRadius: '999px', background: 'var(--bg-card)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                          <div
                            style={{
                              width: `${Math.min(100, Math.round((account.sentToday / Math.max(1, account.recommendedDailyLimit)) * 100))}%`,
                              height: '100%',
                              background: account.warmupStatus === 'WARMED' ? 'var(--success)' : 'var(--accent)',
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select value={account.warmupStatus} onChange={(e) => void handleWarmupStatusChange(account.id, e.target.value as MailAccount['warmupStatus'])}>
                          <option value="COLD">COLD</option>
                          <option value="WARMING">WARMING</option>
                          <option value="PAUSED">PAUSED</option>
                          <option value="WARMED">WARMED</option>
                        </select>
                        <button className="btn-ghost" onClick={() => void handleWarmupAutoToggle(account.id, account.warmupAutoEnabled)}>
                          Auto {account.warmupAutoEnabled ? 'ON' : 'OFF'}
                        </button>
                        {account.type === 'gmail' ? (
                          <button className="btn-ghost" onClick={handleReconnectGmail} title="Reconnect this Gmail account">
                            Reconnect Gmail
                          </button>
                        ) : null}
                        <button
                          className="btn-ghost"
                          onClick={() => void handleRunWarmupNow(account.id)}
                          disabled={account.warmupStatus !== 'WARMING' || !account.warmupAutoEnabled}
                          title={account.warmupStatus !== 'WARMING' ? 'Set status to WARMING first' : account.warmupAutoEnabled ? 'Queue a warmup send now' : 'Turn Auto ON first'}
                        >
                          Run warmup tick
                        </button>
                        <button className="btn-ghost" onClick={() => void handleToggleMailActive(account.id, account.isActive, account.warmupStatus)}>
                          {account.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => void handleDeleteMail(account.id, account.email)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card" style={{ padding: '18px' }}>
            <h3 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '10px' }}>WhatsApp Accounts (Baileys)</h3>
            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
            ) : whatsappAccounts.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No WhatsApp account connected.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {whatsappAccounts.map((wa) => (
                  <div key={wa.id} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {wa.displayName} {wa.phoneNumber ? `(${wa.phoneNumber})` : ''}
                        </div>
                        <div style={{ fontSize: '11px', color: wa.connectionStatus === 'CONNECTED' ? 'var(--success)' : 'var(--warning)' }}>
                          Status: {wa.connectionStatus}
                        </div>
                        {wa.connectionStatus === 'CONNECTED' ? (
                          <div style={{ fontSize: '11px', color: 'var(--success)', marginTop: '4px' }}>
                            WhatsApp connected successfully. This account is ready for campaigns.
                          </div>
                        ) : null}
                        {wa.connectionStatus === 'DISCONNECTED' ? (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            Waiting for worker session start. QR should appear automatically after add/reconnect.
                          </div>
                        ) : null}
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Sent today: {wa.sentToday}/{wa.dailyLimit} | Total sent: {wa._count.sentMessages}
                        </div>
                        {wa.lastError ? (
                          <div style={{ fontSize: '11px', color: 'var(--error)', marginTop: '4px' }}>{wa.lastError}</div>
                        ) : null}
                        {wa.lastQr ? (
                          <div style={{ marginTop: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                              QR pending. Scan from linked phone.
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(wa.lastQr)}`}
                                alt={`QR for ${wa.displayName}`}
                                style={{ width: '180px', height: '180px', borderRadius: '8px', border: '1px solid var(--border)', background: 'white' }}
                              />
                              <div style={{ maxWidth: '320px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                  1. Open WhatsApp on phone
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                  2. Linked Devices {`>`} Link a Device
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                  3. Scan this QR code
                                </div>
                                <button
                                  className="btn-ghost"
                                  onClick={() => void navigator.clipboard.writeText(wa.lastQr || '')}
                                >
                                  Copy QR String
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={wa.dailyLimit}
                          onChange={(e) => void handleUpdateWhatsappLimit(wa.id, Math.max(1, Number(e.target.value || 1)))}
                          style={{ width: '80px' }}
                        />
                        <button className="btn-ghost" onClick={() => void handleToggleWhatsappActive(wa.id, wa.isActive)}>
                          {wa.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button className="btn-ghost" onClick={() => void handleReconnectWhatsapp(wa.id)}>
                          Reconnect
                        </button>
                        <button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => void handleDeleteWhatsapp(wa.id, wa.displayName)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === 'add-zoho' ? (
        <div className="glass-card" style={{ padding: '22px' }}>
          <ZohoAccountForm onAccountAdded={() => { setActiveTab('accounts'); void loadAll(); showToast('success', 'Zoho account connected') }} />
        </div>
      ) : null}

      {activeTab === 'add-gmail' ? (
        <div className="glass-card" style={{ padding: '22px' }}>
          <GmailOAuthButton />
        </div>
      ) : null}

      {activeTab === 'add-whatsapp' ? (
        <div className="glass-card" style={{ padding: '22px', maxWidth: '620px' }}>
          <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px' }}>Connect WhatsApp (Baileys)</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            Create a sender profile. Worker will open Baileys session and update QR/status automatically.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="text"
              placeholder="Display name (required)"
              value={waForm.displayName}
              onChange={(e) => setWaForm((prev) => ({ ...prev, displayName: e.target.value }))}
              style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />
            <input
              type="text"
              placeholder="Phone number (optional)"
              value={waForm.phoneNumber}
              onChange={(e) => setWaForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
              style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />
            <input
              type="number"
              min={1}
              max={500}
              value={waForm.dailyLimit}
              onChange={(e) => setWaForm((prev) => ({ ...prev, dailyLimit: Math.max(1, Number(e.target.value || 1)) }))}
              style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />
            <button className="btn-primary" disabled={waSaving || !waForm.displayName.trim()} onClick={() => void handleCreateWhatsapp()}>
              {waSaving ? 'Adding...' : 'Add WhatsApp Account'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function MailAccountsPage() {
  return (
    <Suspense fallback={<div className="animate-fade-in">Loading...</div>}>
      <MailAccountsPageContent />
    </Suspense>
  )
}
