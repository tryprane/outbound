'use client'

import { useState, useEffect } from 'react'

interface MailAccount {
  id: string
  email: string
  type: 'zoho' | 'gmail'
  dailyLimit: number
  sentToday: number
  isActive: boolean
  warmupStatus: 'COLD' | 'WARMING' | 'WARMED' | 'PAUSED'
}

interface Props {
  selectedAccountIds: string[]
  onChange: (ids: string[]) => void
  dailyMailsPerAccount: number
  onDailyMailsChange: (limit: number) => void
}

export function MailDistributionPlanner({
  selectedAccountIds, onChange,
  dailyMailsPerAccount, onDailyMailsChange
}: Props) {
  const [accounts, setAccounts] = useState<MailAccount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/mail-accounts')
      .then(r => r.json())
      .then(data => {
        setAccounts(data)
        setLoading(false)
        
        // Auto-select active accounts if none selected initially
        if (selectedAccountIds.length === 0 && data.length > 0) {
          const activeIds = data
            .filter((a: MailAccount) => a.isActive && a.warmupStatus === 'WARMED')
            .map((a: MailAccount) => a.id)
          onChange(activeIds)
        }
      })
      .catch(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAccount = (id: string) => {
    if (selectedAccountIds.includes(id)) {
      onChange(selectedAccountIds.filter(x => x !== id))
    } else {
      onChange([...selectedAccountIds, id])
    }
  }

  const activeSelectedCount = selectedAccountIds.filter(
    id => {
      const account = accounts.find(a => a.id === id)
      return account?.isActive && account.warmupStatus === 'WARMED'
    }
  ).length

  const totalSendingCapacity = activeSelectedCount * dailyMailsPerAccount

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Loading mail accounts...</div>
  }

  if (accounts.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
        <p style={{ color: 'var(--warning)', marginBottom: '12px' }}>⚠️ No mail accounts found</p>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>You must add at least one Zoho or Gmail account before creating a campaign.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Distribution settings */}
      <div style={{ marginBottom: '24px', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Daily Mails Per Account
          </label>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            How many emails should each selected account send per day for THIS campaign?
          </p>
          <input
            type="number"
            min="1" max="500"
            value={dailyMailsPerAccount}
            onChange={(e) => onDailyMailsChange(Number(e.target.value))}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '10px 14px',
              borderRadius: '8px', color: 'var(--text-primary)', width: '120px', outline: 'none'
            }}
          />
        </div>

        <div style={{ flex: 1, background: 'var(--accent-light)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.3)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)', marginBottom: '8px' }}>
            Total Campaign Capacity
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {totalSendingCapacity.toLocaleString()} <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text-muted)' }}>emails / day</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Using {activeSelectedCount} active account{activeSelectedCount !== 1 && 's'} in round-robin.
          </div>
        </div>
      </div>

      {/* Account selection list */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
        Select Sending Accounts
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
        Only accounts with <strong style={{ color: 'var(--success)' }}>Warmup = WARMED</strong> and Active status can participate.
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
        {accounts.map(account => {
          const isSelected = selectedAccountIds.includes(account.id)
          const isInactive = !account.isActive
          const isNotWarmed = account.warmupStatus !== 'WARMED'
          const isBlocked = isInactive || isNotWarmed

          return (
            <button
              key={account.id}
              onClick={() => toggleAccount(account.id)}
              disabled={isBlocked}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '16px', borderRadius: '10px', textAlign: 'left',
                background: isSelected ? 'rgba(99,102,241,0.08)' : 'var(--bg-secondary)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                cursor: isBlocked ? 'not-allowed' : 'pointer',
                opacity: isBlocked ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: '18px', height: '18px', borderRadius: '4px',
                background: isSelected ? 'var(--accent)' : 'transparent',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', flexShrink: 0,
              }}>
                {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
              </div>
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {account.email}
                  </span>
                  <span style={{
                    fontSize: '9px', padding: '2px 6px', borderRadius: '8px', fontWeight: 600,
                    background: account.type === 'zoho' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                    color: account.type === 'zoho' ? '#f59e0b' : '#ef4444',
                  }}>
                    {account.type.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Limit: {account.dailyLimit}/day
                </div>
                <div style={{ fontSize: '11px', color: account.warmupStatus === 'WARMED' ? 'var(--success)' : 'var(--warning)' }}>
                  Warmup: {account.warmupStatus}
                </div>
              </div>

              {isBlocked && (
                <div style={{ fontSize: '11px', color: 'var(--error)' }}>Disabled</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
