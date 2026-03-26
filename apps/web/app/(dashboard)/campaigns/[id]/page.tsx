'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/shared/StatusBadge'

type CampaignChannel = 'EMAIL' | 'WHATSAPP'

interface CampaignDetail {
  id: string
  name: string
  type: string
  channel: CampaignChannel
  status: 'draft' | 'active' | 'paused' | 'completed' | 'failed'
  createdAt: string
  scrapeEmail: boolean
  scrapeWhatsapp: boolean
  dailyMailsPerAccount: number
  prompt: string
  progress: number
  whatsappColumn: string | null
  csvFile: { originalName: string; rowCount: number; id: string }
  mailAccounts: {
    mailAccount: {
      id: string
      displayName: string
      email: string
      type: string
      isActive: boolean
      warmupStatus: 'COLD' | 'WARMING' | 'WARMED' | 'PAUSED'
      sentToday: number
      lastMailSentAt: string | null
    }
  }[]
  whatsappAccounts: {
    whatsappAccount: {
      id: string
      displayName: string
      phoneNumber: string | null
      isActive: boolean
      connectionStatus: 'DISCONNECTED' | 'QR_PENDING' | 'CONNECTED' | 'ERROR'
      sentToday: number
      lastMessageSentAt: string | null
    }
  }[]
  _count: { sentMails: number; sentWhatsAppMessages: number }
  upcomingSchedule: {
    nextRunAt: string | null
    slots: {
      position: number
      scheduledAt: string
      mailAccountId: string
      senderEmail: string
      senderDisplayName: string
      senderType: string
    }[]
  }
  recentSent: Array<{
    id: string
    status: 'sent' | 'failed' | 'bounced'
    sentAt: string
    openedAt?: string | null
    lastOpenedAt?: string | null
    openCount?: number
    errorMessage?: string | null
    toEmail?: string
    subject?: string
    mailAccount?: { email: string }
    toPhone?: string
    message?: string
    whatsappAccount?: { displayName: string; phoneNumber: string | null }
  }>
  emailOpenStats?: {
    sent: number
    opened: number
    unopened: number
    openRate: number
  } | null
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchCampaign = () => {
    fetch(`/api/campaigns/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error('not found')
        return r.json()
      })
      .then((data) => {
        setCampaign(data)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
        router.push('/campaigns')
      })
  }

  useEffect(() => {
    fetchCampaign()
    const timer = setInterval(fetchCampaign, 30_000)
    return () => clearInterval(timer)
  }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = async (action: 'start' | 'pause') => {
    setActionLoading(true)
    await fetch(`/api/campaigns/${params.id}/${action}`, { method: 'POST' })
    await fetchCampaign()
    setActionLoading(false)
  }

  const handleDelete = async () => {
    if (!confirm('Delete this campaign? This cannot be undone.')) return
    setActionLoading(true)
    await fetch(`/api/campaigns/${params.id}`, { method: 'DELETE' })
    router.push('/campaigns')
  }

  if (loading || !campaign) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading campaign...</div>
  }

  const isWhatsApp = campaign.channel === 'WHATSAPP'
  const activeSenders = isWhatsApp
    ? campaign.whatsappAccounts.filter((a) => a.whatsappAccount.isActive && a.whatsappAccount.connectionStatus === 'CONNECTED').length
    : campaign.mailAccounts.filter((a) => a.mailAccount.isActive && a.mailAccount.warmupStatus === 'WARMED').length
  const dailyCapacity = activeSenders * campaign.dailyMailsPerAccount
  const totalSent = isWhatsApp ? campaign._count.sentWhatsAppMessages : campaign._count.sentMails

  return (
    <div className="animate-fade-in" style={{ maxWidth: '980px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            <Link href="/campaigns" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Campaigns</Link>
            {' / '}
            <span style={{ color: 'var(--text-secondary)' }}>{campaign.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Channel: <strong style={{ color: isWhatsApp ? '#22c55e' : 'var(--accent)' }}>{campaign.channel}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {campaign.status === 'active' ? (
            <button onClick={() => handleStatusChange('pause')} disabled={actionLoading} className="btn-ghost">
              Pause
            </button>
          ) : campaign.status !== 'completed' ? (
            <button
              onClick={() => handleStatusChange('start')}
              disabled={actionLoading || activeSenders === 0}
              className="btn-primary"
              style={{ background: 'var(--success)', color: 'white' }}
            >
              Resume
            </button>
          ) : null}

          <Link href={`/campaigns/${campaign.id}/logs`} style={{ textDecoration: 'none' }}>
            <button className="btn-ghost">View Logs</button>
          </Link>

          <button onClick={handleDelete} disabled={actionLoading} className="btn-ghost" style={{ color: 'var(--error)' }}>
            Delete
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-card" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--accent)' }}>{campaign.progress}%</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {totalSent.toLocaleString()} / {campaign.csvFile.rowCount.toLocaleString()} sent
              </div>
            </div>
            <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${campaign.progress}%`, background: 'var(--accent)', borderRadius: '4px' }} />
            </div>
            <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Active senders: <strong>{activeSenders}</strong> | Capacity: <strong>{dailyCapacity}/day</strong>
            </div>
          </div>

          {!isWhatsApp && campaign.emailOpenStats ? (
            <div className="glass-card" style={{ padding: '22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Opened</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success)' }}>{campaign.emailOpenStats.opened}</div>
                </div>
                <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Not opened</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--warning)' }}>{campaign.emailOpenStats.unopened}</div>
                </div>
                <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Open rate</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{campaign.emailOpenStats.openRate}%</div>
                </div>
              </div>
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                Open tracking is best-effort and only counts delivered emails that load the tracking pixel.
              </div>
            </div>
          ) : null}

          <div className="glass-card" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Upcoming {isWhatsApp ? 'WhatsApp' : 'Mail'} Schedule
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Next: {campaign.upcomingSchedule?.nextRunAt ? formatDateTime(campaign.upcomingSchedule.nextRunAt) : 'N/A'}
              </span>
            </div>
            {campaign.upcomingSchedule?.slots?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                {campaign.upcomingSchedule.slots.slice(0, 25).map((slot) => (
                  <div key={`${slot.position}-${slot.scheduledAt}`} style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: '10px', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>#{slot.position}</div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{slot.senderEmail}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{slot.senderDisplayName}</div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>{formatDateTime(slot.scheduledAt)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No upcoming slots yet. Ensure eligible senders are connected and active.
              </div>
            )}
          </div>

          <div className="glass-card" style={{ padding: '22px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Recent {isWhatsApp ? 'WhatsApp' : 'Mail'} Activity
            </h3>
            {campaign.recentSent.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                {campaign.recentSent.slice(0, 12).map((log) => (
                  <div key={log.id} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {isWhatsApp ? log.toPhone : log.toEmail}
                      </div>
                      <StatusBadge status={log.status} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {isWhatsApp
                        ? (log.whatsappAccount?.phoneNumber || log.whatsappAccount?.displayName || 'Unknown sender')
                        : (log.mailAccount?.email || 'Unknown sender')}
                    </div>
                    {!isWhatsApp ? (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {log.status === 'sent'
                          ? (log.openedAt ? `Opened ${formatDateTime(log.openedAt)}` : 'Not opened yet')
                          : 'Open tracking unavailable'}
                        {log.status === 'sent' && log.openCount && log.openCount > 1 ? ` | ${log.openCount} views` : ''}
                      </div>
                    ) : null}
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{formatDateTime(log.sentAt)}</div>
                    {log.errorMessage ? <div style={{ fontSize: '11px', color: 'var(--error)', marginTop: '4px' }}>{log.errorMessage}</div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No activity yet.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
              Data Source
            </h3>
            <Link href={`/csv/${campaign.csvFile.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ padding: '12px', border: '1px solid var(--accent)', borderRadius: '8px', background: 'var(--accent-light)', color: 'var(--accent)' }}>
                {campaign.csvFile.originalName}
              </div>
            </Link>
            <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Rows: {campaign.csvFile.rowCount.toLocaleString()}
            </div>
            {isWhatsApp && campaign.whatsappColumn ? (
              <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Mapped phone column: <strong>{campaign.whatsappColumn}</strong>
              </div>
            ) : null}
          </div>

          <div className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
              Sender Pool
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {isWhatsApp
                ? campaign.whatsappAccounts.map((a) => (
                    <div key={a.whatsappAccount.id} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>{a.whatsappAccount.displayName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{a.whatsappAccount.phoneNumber || 'No number set'}</div>
                      <div style={{ fontSize: '11px', color: a.whatsappAccount.connectionStatus === 'CONNECTED' ? 'var(--success)' : 'var(--warning)' }}>
                        {a.whatsappAccount.connectionStatus} {a.whatsappAccount.isActive ? '' : '(Inactive)'}
                      </div>
                    </div>
                  ))
                : campaign.mailAccounts.map((a) => (
                    <div key={a.mailAccount.id} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>{a.mailAccount.email}</div>
                      <div style={{ fontSize: '11px', color: a.mailAccount.warmupStatus === 'WARMED' ? 'var(--success)' : 'var(--warning)' }}>
                        {a.mailAccount.warmupStatus} {a.mailAccount.isActive ? '' : '(Inactive)'}
                      </div>
                    </div>
                  ))}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
              AI Prompt
            </h3>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: 1.6, color: 'var(--text-secondary)', maxHeight: '240px', overflowY: 'auto', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px' }}>
              {campaign.prompt}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
