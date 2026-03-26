import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function getStats() {
  const [campaigns, mailAccounts, csvFiles, sentToday] = await Promise.all([
    prisma.campaign.count(),
    prisma.mailAccount.count(),
    prisma.csvFile.count(),
    prisma.sentMail.count({
      where: {
        sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        status: 'sent',
      },
    }),
  ])
  const activeCampaigns = await prisma.campaign.count({ where: { status: 'active' } })
  return { campaigns, mailAccounts, csvFiles, sentToday, activeCampaigns }
}

import { HoverCard } from '@/components/HoverCard'

export default async function DashboardPage() {
  const stats = await getStats()

  const statCards = [
    { label: 'Total Campaigns', value: stats.campaigns, sub: `${stats.activeCampaigns} active`, color: 'var(--accent)', href: '/campaigns' },
    { label: 'Mail Accounts', value: stats.mailAccounts, sub: 'Zoho + Gmail', color: 'var(--success)', href: '/mail-accounts' },
    { label: 'CSV Files', value: stats.csvFiles, sub: 'Uploaded datasets', color: 'var(--warning)', href: '/csv' },
    { label: 'Sent Today', value: stats.sentToday, sub: 'Across all accounts', color: '#a78bfa', href: '/sent' },
  ]

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
          Dashboard
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          OutreachOS — Your outbound automation command center
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {statCards.map((card) => (
          <Link key={card.label} href={card.href} style={{ textDecoration: 'none' }}>
            <HoverCard
              className="glass-card"
              style={{ padding: '24px', cursor: 'pointer', transition: 'transform 0.15s', borderTop: `3px solid ${card.color}` }}
            >
              <div style={{ fontSize: '32px', fontWeight: 700, color: card.color }}>{card.value}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '4px 0 2px' }}>{card.label}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{card.sub}</div>
            </HoverCard>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
          Quick Actions
        </h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/campaigns/new">
            <button className="btn-primary">⚡ New Campaign</button>
          </Link>
          <Link href="/csv">
            <button className="btn-ghost">📁 Upload CSV</button>
          </Link>
          <Link href="/mail-accounts">
            <button className="btn-ghost">📧 Add Mail Account</button>
          </Link>
          <Link href="/sent">
            <button className="btn-ghost">📊 View Analytics</button>
          </Link>
        </div>
      </div>
    </div>
  )
}
