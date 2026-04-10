'use client'

import { useState } from 'react'

interface ZohoAccountFormProps {
  onAccountAdded: () => void
}

interface FormData {
  displayName: string
  email: string
  smtpHost: string
  smtpPort: string
  password: string
  dailyLimit: string
}

const DEFAULT_FORM: FormData = {
  displayName: '',
  email: '',
  smtpHost: 'smtp.zoho.in',
  smtpPort: '465',
  password: '',
  dailyLimit: '40',
}

export function ZohoAccountForm({ onAccountAdded }: ZohoAccountFormProps) {
  const [form, setForm] = useState<FormData>(DEFAULT_FORM)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    setTestResult(null)
    setError(null)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      const res = await fetch('/api/mail-accounts/zoho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          smtpHost: form.smtpHost,
          smtpPort: Number(form.smtpPort),
          password: form.password,
          testOnly: true,
        }),
      })
      const data = await res.json()
      setTestResult({ ok: res.ok, msg: data.message || data.error })
    } catch {
      setTestResult({ ok: false, msg: 'Could not reach server' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/mail-accounts/zoho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: form.displayName || form.email,
          email: form.email,
          smtpHost: form.smtpHost,
          smtpPort: Number(form.smtpPort),
          password: form.password,
          dailyLimit: Number(form.dailyLimit),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setForm(DEFAULT_FORM)
      onAccountAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px 14px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
  }

  const labelStyle = {
    fontSize: '12px',
    fontWeight: 600 as const,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
    display: 'block',
  }

  return (
    <div>
      <div style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        Step 1: connect Zoho SMTP for sending. After that, you can attach Zoho API for the same email address to unlock inbox sync, spam rescue, and reply actions without creating a second account.
      </div>

      <div className="grid gap-4 sm:grid-cols-2" style={{ marginBottom: '16px' }}>
        {/* Display Name */}
        <div>
          <label style={labelStyle}>Display Name</label>
          <input style={inputStyle} placeholder="e.g. Agency Outreach #1" value={form.displayName} onChange={set('displayName')} />
        </div>

        {/* Email */}
        <div>
          <label style={labelStyle}>Email Address *</label>
          <input style={inputStyle} type="email" placeholder="outreach@yourdomain.com" value={form.email} onChange={set('email')} />
        </div>

        {/* SMTP Host */}
        <div>
          <label style={labelStyle}>SMTP Host *</label>
          <select style={inputStyle} value={form.smtpHost} onChange={set('smtpHost')}>
            <option value="smtp.zoho.in">smtp.zoho.in (India)</option>
            <option value="smtp.zoho.com">smtp.zoho.com (International)</option>
            <option value="smtp.zoho.eu">smtp.zoho.eu (EU)</option>
          </select>
        </div>

        {/* Port */}
        <div>
          <label style={labelStyle}>SMTP Port *</label>
          <select style={inputStyle} value={form.smtpPort} onChange={set('smtpPort')}>
            <option value="465">465 (SSL)</option>
            <option value="587">587 (TLS/STARTTLS)</option>
          </select>
        </div>

        {/* Password */}
        <div>
          <label style={labelStyle}>App Password *</label>
          <input style={inputStyle} type="password" placeholder="Zoho app-specific password" value={form.password} onChange={set('password')} />
        </div>

        {/* Daily Limit */}
        <div>
          <label style={labelStyle}>Daily Send Limit</label>
          <input style={inputStyle} type="number" min="1" max="500" value={form.dailyLimit} onChange={set('dailyLimit')} />
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div style={{
          padding: '10px 14px',
          background: testResult.ok ? 'rgba(34, 211, 165, 0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${testResult.ok ? 'rgba(34,211,165,0.3)' : 'rgba(239,68,68,0.3)'}`,
          borderRadius: '8px',
          color: testResult.ok ? 'var(--success)' : 'var(--error)',
          fontSize: '13px',
          marginBottom: '16px',
        }}>
          {testResult.ok ? '✅' : '❌'} {testResult.msg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '10px 14px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          color: 'var(--error)',
          fontSize: '13px',
          marginBottom: '16px',
        }}>
          ❌ {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row" style={{ gap: '10px' }}>
        <button
          className="btn-ghost"
          onClick={handleTest}
          disabled={testing || !form.email || !form.password}
          style={{ opacity: testing || !form.email || !form.password ? 0.5 : 1 }}
        >
          {testing ? '⏳ Testing...' : '🔌 Test Connection'}
        </button>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving || !form.email || !form.password}
          style={{ opacity: saving || !form.email || !form.password ? 0.5 : 1 }}
        >
          {saving ? '⏳ Saving...' : '💾 Save Account'}
        </button>
      </div>
    </div>
  )
}
