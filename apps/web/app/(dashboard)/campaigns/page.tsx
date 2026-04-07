'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PaginationControls } from '@/components/ui/pagination-controls'

interface Campaign {
  id: string
  name: string
  channel: 'EMAIL' | 'WHATSAPP'
  status: 'draft' | 'active' | 'paused' | 'completed' | 'failed'
  guardrailReason: string | null
  createdAt: string
  csvFile: { originalName: string; rowCount: number }
  mailAccounts: { mailAccount: { displayName: string } }[]
  whatsappAccounts: { whatsappAccount: { displayName: string } }[]
  _count: { sentMails: number; sentWhatsAppMessages: number }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(12)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/campaigns?page=${page}&limit=${limit}`)
      .then((r) => r.json())
      .then((data) => {
        setCampaigns(Array.isArray(data?.items) ? data.items : [])
        setTotal(data?.total || 0)
        setPages(data?.pages || 1)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [limit, page])

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Campaigns
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Manage outbound campaigns across Email and WhatsApp channels
          </p>
        </div>
        <Link href="/campaigns/new">
          <button className="btn-primary">New Campaign</button>
        </Link>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px' }}>Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            No campaigns found
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Create your first outbound campaign to start sending
          </div>
          <Link href="/campaigns/new">
            <button className="btn-primary">Create Campaign</button>
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
            {campaigns.map((camp) => {
              const rowCount = camp.csvFile.rowCount
              const sent = camp.channel === 'WHATSAPP' ? camp._count.sentWhatsAppMessages : camp._count.sentMails
              const senderCount = camp.channel === 'WHATSAPP' ? camp.whatsappAccounts.length : camp.mailAccounts.length
              const progress = rowCount > 0 ? Math.min(100, Math.round((sent / rowCount) * 100)) : 0

              return (
                <Link href={`/campaigns/${camp.id}`} key={camp.id} style={{ textDecoration: 'none' }}>
                  <div
                    className="glass-card"
                    style={{
                      padding: '20px',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      height: '100%',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '16px', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {camp.name}
                      </div>
                      <StatusBadge status={camp.status} />
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      Channel: <strong style={{ color: camp.channel === 'WHATSAPP' ? '#22c55e' : 'var(--accent)' }}>{camp.channel}</strong>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div>{camp.csvFile.originalName}</div>
                      <div>{senderCount} sender{senderCount !== 1 ? 's' : ''}</div>
                      <div>Created {formatDate(camp.createdAt)}</div>
                    </div>
                    {camp.guardrailReason ? (
                      <div style={{ fontSize: '11px', color: 'var(--warning)', marginBottom: '12px', lineHeight: 1.5 }}>
                        {camp.guardrailReason}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 'auto' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{sent.toLocaleString()} / {rowCount.toLocaleString()} sent</span>
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{progress}%</span>
                      </div>
                      <div style={{ height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${progress}%`,
                          background: 'var(--accent)',
                          borderRadius: '3px',
                          transition: 'width 0.5s ease',
                        }}/>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
          <PaginationControls
            page={page}
            pages={pages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(value) => {
              setLimit(value)
              setPage(1)
            }}
            label="campaigns"
          />
        </div>
      )}
    </div>
  )
}
