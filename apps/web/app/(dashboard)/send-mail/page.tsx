'use client'

import { useEffect, useMemo, useState } from 'react'

type SenderAccount = {
  id: string
  email: string
  displayName: string
  dailyLimit: number
  sentToday: number
  isActive: boolean
  warmupStatus: 'COLD' | 'WARMING' | 'WARMED' | 'PAUSED'
  mailboxSyncStatus: 'idle' | 'syncing' | 'error'
}

type SenderResponse = {
  items: SenderAccount[]
}

function parseRecipients(input: string) {
  return Array.from(
    new Set(
      input
        .split(/[\n,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

export default function SendMailPage() {
  const [accounts, setAccounts] = useState<SenderAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [form, setForm] = useState({
    mailAccountId: '',
    recipients: '',
    subject: '',
    body: '',
  })

  useEffect(() => {
    let cancelled = false

    async function loadAccounts() {
      setLoadingAccounts(true)
      try {
        const response = await fetch('/api/mail-accounts?resource=sent-filter-options&page=1&limit=200')
        const data = await response.json() as SenderResponse
        if (cancelled) return
        const eligible = (Array.isArray(data?.items) ? data.items : []).filter(
          (account) => account.isActive && account.warmupStatus === 'WARMED' && account.mailboxSyncStatus !== 'error'
        )
        setAccounts(eligible)
        setForm((current) => ({
          ...current,
          mailAccountId: current.mailAccountId || eligible[0]?.id || '',
        }))
      } catch {
        if (!cancelled) {
          setAccounts([])
          setToast({ type: 'error', message: 'Failed to load sender accounts.' })
        }
      } finally {
        if (!cancelled) setLoadingAccounts(false)
      }
    }

    void loadAccounts()
    return () => {
      cancelled = true
    }
  }, [])

  const parsedRecipients = useMemo(() => parseRecipients(form.recipients), [form.recipients])
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === form.mailAccountId) || null,
    [accounts, form.mailAccountId]
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setToast(null)

    if (!form.mailAccountId) {
      setToast({ type: 'error', message: 'Choose a sender account first.' })
      return
    }

    if (parsedRecipients.length === 0) {
      setToast({ type: 'error', message: 'Add at least one recipient email.' })
      return
    }

    if (!form.subject.trim() || !form.body.trim()) {
      setToast({ type: 'error', message: 'Subject and body are required.' })
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/send-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailAccountId: form.mailAccountId,
          recipients: parsedRecipients,
          subject: form.subject.trim(),
          body: form.body,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setToast({ type: 'error', message: data.error || 'Failed to queue manual mail send.' })
        return
      }

      setToast({
        type: 'success',
        message: `Queued ${data.queuedCount || parsedRecipients.length} email${parsedRecipients.length === 1 ? '' : 's'} from ${data.sender?.email || 'the selected sender'}.`,
      })
      setForm((current) => ({
        ...current,
        recipients: '',
        subject: '',
        body: '',
      }))
    } catch {
      setToast({ type: 'error', message: 'Failed to queue manual mail send.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="page-shell mb-6 rounded-[32px] border border-white/70 px-6 py-6 shadow-[0_24px_60px_rgba(60,45,25,0.08)]">
        <div style={{ maxWidth: '880px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-muted)' }}>
            Manual send
          </div>
          <h1 style={{ marginTop: '10px', fontSize: '34px', lineHeight: 1.08, fontWeight: 800, color: 'var(--text-primary)' }}>
            Send one-off email from any connected sender.
          </h1>
          <p style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            Pick an active warmed mailbox, add one or many recipients, and queue a manual email through the same delivery pipeline used by the app.
          </p>
        </div>
      </div>

      {toast ? (
        <div
          className="page-shell mb-4 rounded-[22px] px-5 py-4"
          style={{
            border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)'}`,
            background: toast.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            color: toast.type === 'success' ? 'var(--success)' : 'var(--error)',
          }}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="page-shell rounded-[32px] border border-white/70 px-6 py-6 shadow-[0_24px_60px_rgba(60,45,25,0.08)]">
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Sender account
              </label>
              <select
                className="input-base"
                value={form.mailAccountId}
                onChange={(event) => setForm((current) => ({ ...current, mailAccountId: event.target.value }))}
                disabled={loadingAccounts || accounts.length === 0}
              >
                <option value="">{loadingAccounts ? 'Loading senders...' : 'Select sender account'}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email} - {account.sentToday}/{account.dailyLimit} today
                  </option>
                ))}
              </select>
              {selectedAccount ? (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {selectedAccount.displayName} | {selectedAccount.warmupStatus} | sync {selectedAccount.mailboxSyncStatus}
                </div>
              ) : null}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Recipient count
              </label>
              <div
                className="input-base"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: '48px',
                  background: 'rgba(255,255,255,0.72)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                }}
              >
                {parsedRecipients.length} recipient{parsedRecipients.length === 1 ? '' : 's'}
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Separate emails with commas, semicolons, or new lines.
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Recipients
            </label>
            <textarea
              className="input-base"
              value={form.recipients}
              onChange={(event) => setForm((current) => ({ ...current, recipients: event.target.value }))}
              placeholder={'alice@example.com, bob@example.com\ncarol@example.com'}
              style={{ minHeight: '120px', resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Subject
            </label>
            <input
              className="input-base"
              value={form.subject}
              onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              placeholder="Quick introduction"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Body
            </label>
            <textarea
              className="input-base"
              value={form.body}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              placeholder={'Hi there,\n\nWanted to reach out with a quick note.\n\nBest,\nTeam'}
              style={{ minHeight: '280px', resize: 'vertical' }}
            />
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Plain text is converted into email HTML automatically.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Manual sends go through the normal sent-mail tracking flow and will appear on the Sent page.
            </div>
            <button className="btn-primary" type="submit" disabled={saving || loadingAccounts || accounts.length === 0}>
              {saving ? 'Queueing...' : 'Send mail'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
