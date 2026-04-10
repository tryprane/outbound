'use client'

import { StatusBadge } from '@/components/shared/StatusBadge'

export const panelStyle: React.CSSProperties = {
  padding: '22px',
  borderRadius: '28px',
  border: '1px solid rgba(60, 45, 25, 0.08)',
  background: 'rgba(255,255,255,0.88)',
  boxShadow: '0 20px 52px rgba(60, 45, 25, 0.08)',
}

export const surfaceCardStyle: React.CSSProperties = {
  padding: '18px',
  borderRadius: '22px',
  border: '1px solid rgba(60, 45, 25, 0.08)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,247,241,0.95))',
}

export function StatCard({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div style={surfaceCardStyle}>
      <div style={{ fontSize: '24px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>{label}</div>
    </div>
  )
}

export function MetricPair({ label, value, tone = 'var(--text-primary)' }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '13px', color: tone, marginTop: '4px', lineHeight: 1.45 }}>{value}</div>
    </div>
  )
}

export function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.max(0, Math.round((value / Math.max(1, max)) * 100)))
  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ height: '8px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, boxShadow: `0 0 18px ${color}` }} />
      </div>
    </div>
  )
}

export function AccountHeader(props: {
  title: string
  providerLabel: string
  statusLabel: string
  secondaryStatus?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{props.title}</div>
      <StatusBadge status={props.providerLabel.toLowerCase()} />
      <span className="badge" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--text-primary)' }}>
        {props.statusLabel}
      </span>
      {props.secondaryStatus ? (
        <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
          {props.secondaryStatus}
        </span>
      ) : null}
    </div>
  )
}

export function ActionGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2">{children}</div>
}
