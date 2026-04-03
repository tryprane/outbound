'use client'

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'

type MailAccountOption = {
  id: string
  email: string
  displayName: string
  type: 'zoho' | 'gmail'
}

type WhatsAppAccountOption = {
  id: string
  displayName: string
  phoneNumber: string | null
}

type EmailInboxMessage = {
  id: string
  mailAccountId: string
  folderKind: 'INBOX' | 'SPAM' | 'SENT' | 'ARCHIVE' | 'OTHER'
  direction: 'inbound' | 'outbound'
  fromEmail: string | null
  toEmail: string | null
  subject: string | null
  snippet: string | null
  sentAt: string | null
  receivedAt: string | null
  isWarmup: boolean
  isRead: boolean
  isSpam: boolean
  repliedAt: string | null
  openedAt: string | null
  rescuedAt: string | null
  mailAccount: MailAccountOption
}

type WhatsAppConversationSummary = {
  id: string
  participantJid: string
  participantPhone: string | null
  participantName: string | null
  lastMessageAt: string | null
  whatsappAccountId: string
  whatsappAccount: {
    id: string
    displayName: string
    phoneNumber: string | null
    connectionStatus: string
    isActive: boolean
  }
  lastMessage: {
    id: string
    direction: 'inbound' | 'outbound'
    body: string
    status: string | null
    sentAt: string | null
    receivedAt: string | null
    createdAt: string
  } | null
}

type WhatsAppConversationDetail = {
  id: string
  participantJid: string
  participantPhone: string | null
  participantName: string | null
  lastMessageAt: string | null
  whatsappAccountId: string
  whatsappAccount: {
    id: string
    displayName: string
    phoneNumber: string | null
    connectionStatus: string
    isActive: boolean
  }
  messages: Array<{
    id: string
    direction: 'inbound' | 'outbound'
    body: string
    status: string | null
    sentAt: string | null
    receivedAt: string | null
    createdAt: string
  }>
}

type InboxRetention = {
  emailDays: number
  whatsappDays: number
}

function formatDate(value?: string | null) {
  if (!value) return 'No timestamp'
  return new Date(value).toLocaleString()
}

function Surface(props: React.PropsWithChildren<{ style?: React.CSSProperties }>) {
  return (
    <div
      style={{
        padding: '18px',
        borderRadius: '20px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'linear-gradient(180deg, rgba(22,22,31,0.96), rgba(14,14,22,0.96))',
        boxShadow: '0 18px 45px rgba(0,0,0,0.25)',
        ...props.style,
      }}
    >
      {props.children}
    </div>
  )
}

export default function InboxPage() {
  const [activeChannel, setActiveChannel] = useState<'email' | 'whatsapp'>('email')
  const [mailAccounts, setMailAccounts] = useState<MailAccountOption[]>([])
  const [whatsappAccounts, setWhatsappAccounts] = useState<WhatsAppAccountOption[]>([])
  const [retention, setRetention] = useState<InboxRetention>({ emailDays: 30, whatsappDays: 45 })
  const [emailFolder, setEmailFolder] = useState<'INBOX' | 'SPAM' | 'SENT'>('INBOX')
  const [selectedMailAccountId, setSelectedMailAccountId] = useState('')
  const [includeWarmup, setIncludeWarmup] = useState(false)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [emailMessages, setEmailMessages] = useState<EmailInboxMessage[]>([])
  const [emailLoading, setEmailLoading] = useState(true)
  const [replyingMessageId, setReplyingMessageId] = useState<string | null>(null)
  const [emailReplySubject, setEmailReplySubject] = useState('Re: Quick follow-up')
  const [emailReplyBody, setEmailReplyBody] = useState('<p>Thanks for your message. Sharing a quick follow-up from the unified inbox.</p>')
  const [waSearch, setWaSearch] = useState('')
  const deferredWaSearch = useDeferredValue(waSearch)
  const [selectedWhatsappAccountId, setSelectedWhatsappAccountId] = useState('')
  const [whatsappLoading, setWhatsappLoading] = useState(true)
  const [waConversations, setWaConversations] = useState<WhatsAppConversationSummary[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<WhatsAppConversationDetail | null>(null)
  const [waComposer, setWaComposer] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const loadAccounts = async () => {
      const [mailRes, waRes] = await Promise.all([
        fetch('/api/mail-accounts').then((res) => res.json()).catch(() => []),
        fetch('/api/mail-accounts?resource=whatsapp-accounts').then((res) => res.json()).catch(() => []),
      ])
      setMailAccounts(
        Array.isArray(mailRes)
          ? mailRes.map((account) => ({
              id: account.id,
              email: account.email,
              displayName: account.displayName,
              type: account.type,
            }))
          : []
      )
      setWhatsappAccounts(
        Array.isArray(waRes)
          ? waRes.map((account) => ({
              id: account.id,
              displayName: account.displayName,
              phoneNumber: account.phoneNumber,
            }))
          : []
      )
    }
    void loadAccounts()
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadEmail = async () => {
      setEmailLoading(true)
      const params = new URLSearchParams({
        channel: 'email',
        folderKind: emailFolder,
      })
      if (selectedMailAccountId) params.set('mailAccountId', selectedMailAccountId)
      if (includeWarmup) params.set('includeWarmup', 'true')
      if (deferredSearch.trim()) params.set('search', deferredSearch.trim())

      const data = await fetch(`/api/inbox?${params.toString()}`).then((res) => res.json()).catch(() => ({ messages: [], retention }))
      if (cancelled) return
      setEmailMessages(Array.isArray(data.messages) ? data.messages : [])
      if (data.retention) setRetention(data.retention)
      setEmailLoading(false)
    }

    void loadEmail()
    const timer = setInterval(() => void loadEmail(), 10_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [deferredSearch, emailFolder, includeWarmup, selectedMailAccountId])

  useEffect(() => {
    let cancelled = false
    const loadWhatsApp = async () => {
      setWhatsappLoading(true)
      const params = new URLSearchParams({ channel: 'whatsapp' })
      if (selectedWhatsappAccountId) params.set('whatsappAccountId', selectedWhatsappAccountId)
      if (selectedConversationId) params.set('conversationId', selectedConversationId)
      if (deferredWaSearch.trim()) params.set('search', deferredWaSearch.trim())

      const data = await fetch(`/api/inbox?${params.toString()}`).then((res) => res.json()).catch(() => ({ conversations: [], selectedConversation: null, retention }))
      if (cancelled) return
      const conversations = Array.isArray(data.conversations) ? data.conversations : []
      setWaConversations(conversations)
      setSelectedConversation((data.selectedConversation as WhatsAppConversationDetail | null) ?? null)
      if (!selectedConversationId && conversations[0]?.id) {
        setSelectedConversationId(conversations[0].id)
      }
      if (data.retention) setRetention(data.retention)
      setWhatsappLoading(false)
    }

    void loadWhatsApp()
    const timer = setInterval(() => void loadWhatsApp(), 10_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [deferredWaSearch, selectedConversationId, selectedWhatsappAccountId])

  const activeRetentionLabel = activeChannel === 'email' ? `${retention.emailDays} days` : `${retention.whatsappDays} days`

  const selectedEmailCountLabel = useMemo(() => {
    if (!selectedMailAccountId) return 'All mail accounts'
    return mailAccounts.find((account) => account.id === selectedMailAccountId)?.email || 'Selected account'
  }, [mailAccounts, selectedMailAccountId])

  async function runEmailAction(message: EmailInboxMessage, action: 'mark-read' | 'rescue-to-inbox' | 'reply') {
    setBusyAction(`${action}:${message.id}`)
    const response = await fetch('/api/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'email',
        mailAccountId: message.mailAccountId,
        mailboxMessageId: message.id,
        action,
        ...(action === 'reply' ? { subject: emailReplySubject, html: emailReplyBody } : {}),
      }),
    })
    const data = await response.json().catch(() => ({ error: 'Inbox action failed' }))
    setBusyAction(null)
    if (!response.ok) {
      setToast({ type: 'error', message: data.error || 'Inbox action failed' })
      return
    }
    setToast({ type: 'success', message: action === 'reply' ? 'Reply queued for sync and sent' : 'Inbox updated' })
    setReplyingMessageId(null)
    setEmailMessages((current) =>
      current.map((item) =>
        item.id === message.id
          ? {
              ...item,
              isRead: true,
              isSpam: action === 'rescue-to-inbox' ? false : item.isSpam,
              folderKind: action === 'rescue-to-inbox' ? 'INBOX' : item.folderKind,
              repliedAt: action === 'reply' ? new Date().toISOString() : item.repliedAt,
            }
          : item
      )
    )
  }

  async function sendWhatsappReply() {
    if (!selectedConversationId || !waComposer.trim()) return
    setBusyAction(`whatsapp:${selectedConversationId}`)
    const response = await fetch('/api/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'whatsapp',
        conversationId: selectedConversationId,
        body: waComposer.trim(),
      }),
    })
    const data = await response.json().catch(() => ({ error: 'Failed to queue WhatsApp reply' }))
    setBusyAction(null)
    if (!response.ok) {
      setToast({ type: 'error', message: data.error || 'Failed to queue WhatsApp reply' })
      return
    }
    setWaComposer('')
    setToast({ type: 'success', message: 'WhatsApp reply queued through the worker' })
  }

  async function clearSyncedData(scope: 'email' | 'whatsapp' | 'all') {
    if (!window.confirm(`Clear synced ${scope} inbox data from the database cache?`)) return
    setBusyAction(`clear:${scope}`)
    const response = await fetch(`/api/inbox?scope=${scope}`, { method: 'DELETE' })
    const data = await response.json().catch(() => ({ error: 'Failed to clear inbox cache' }))
    setBusyAction(null)
    if (!response.ok) {
      setToast({ type: 'error', message: data.error || 'Failed to clear inbox cache' })
      return
    }
    setToast({ type: 'success', message: `Cleared synced ${scope} inbox cache` })
    if (scope === 'all' || scope === 'email') setEmailMessages([])
    if (scope === 'all' || scope === 'whatsapp') {
      setWaConversations([])
      setSelectedConversation(null)
    }
  }

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gap: '18px' }}>
      {toast ? (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 100,
            padding: '10px 14px',
            borderRadius: '10px',
            background: toast.type === 'success' ? 'rgba(34,211,165,0.16)' : 'rgba(239,68,68,0.16)',
            color: toast.type === 'success' ? 'var(--success)' : 'var(--error)',
            border: `1px solid ${toast.type === 'success' ? 'rgba(34,211,165,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}
        >
          {toast.message}
        </div>
      ) : null}

      <Surface>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>
              Unified Inbox
            </div>
            <h1 style={{ fontSize: '32px', lineHeight: 1.1, fontWeight: 800, marginTop: '8px', color: 'var(--text-primary)' }}>
              Manage email replies and software-owned WhatsApp conversations from one place
            </h1>
            <p style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)', maxWidth: '900px' }}>
              Email shows synced mailbox traffic across every connected inbox. WhatsApp shows only conversations created by this software.
              Synced inbox cache is auto-pruned after {activeRetentionLabel}, and you can clear it manually when you do not need the stored history.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className={activeChannel === 'email' ? 'btn-primary' : 'btn-ghost'} onClick={() => startTransition(() => setActiveChannel('email'))}>
              Email Inbox
            </button>
            <button className={activeChannel === 'whatsapp' ? 'btn-primary' : 'btn-ghost'} onClick={() => startTransition(() => setActiveChannel('whatsapp'))}>
              WhatsApp Inbox
            </button>
            <button className="btn-ghost" onClick={() => void clearSyncedData(activeChannel)} disabled={busyAction === `clear:${activeChannel}`}>
              {busyAction === `clear:${activeChannel}` ? 'Clearing...' : `Clear ${activeChannel} cache`}
            </button>
          </div>
        </div>
      </Surface>

      {activeChannel === 'email' ? (
        <>
          <Surface>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '10px' }}>
              <select className="input-base" value={emailFolder} onChange={(event) => setEmailFolder(event.target.value as 'INBOX' | 'SPAM' | 'SENT')}>
                <option value="INBOX">Inbox</option>
                <option value="SPAM">Spam</option>
                <option value="SENT">Sent</option>
              </select>
              <select className="input-base" value={selectedMailAccountId} onChange={(event) => setSelectedMailAccountId(event.target.value)}>
                <option value="">All mail accounts</option>
                {mailAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email}
                  </option>
                ))}
              </select>
              <input className="input-base" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search subject, snippet, or sender" />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={includeWarmup} onChange={(event) => setIncludeWarmup(event.target.checked)} />
                Include warmup mail
              </label>
            </div>
            <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Showing {emailMessages.length} {emailFolder.toLowerCase()} messages from {selectedEmailCountLabel}.
            </div>
          </Surface>

          <Surface>
            {emailLoading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading inbox...</div>
            ) : emailMessages.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No synced email found for this view.</div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {emailMessages.map((message) => (
                  <div
                    key={message.id}
                    style={{
                      padding: '16px',
                      borderRadius: '16px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ maxWidth: '860px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {message.subject || '(no subject)'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                          {message.direction === 'inbound' ? `From ${message.fromEmail || 'Unknown'}` : `To ${message.toEmail || 'Unknown'}`} via {message.mailAccount.email}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {formatDate(message.receivedAt || message.sentAt)} | {message.folderKind} | {message.isRead ? 'Read' : 'Unread'}
                          {message.isWarmup ? ' | Warmup' : ''}
                          {message.repliedAt ? ' | Replied' : ''}
                        </div>
                        {message.snippet ? (
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px', lineHeight: 1.6 }}>
                            {message.snippet}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignContent: 'start' }}>
                        {!message.isRead ? (
                          <button className="btn-ghost" onClick={() => void runEmailAction(message, 'mark-read')} disabled={busyAction === `mark-read:${message.id}`}>
                            Mark read
                          </button>
                        ) : null}
                        {message.isSpam ? (
                          <button className="btn-ghost" onClick={() => void runEmailAction(message, 'rescue-to-inbox')} disabled={busyAction === `rescue-to-inbox:${message.id}`}>
                            Rescue to inbox
                          </button>
                        ) : null}
                        {message.direction === 'inbound' ? (
                          <button
                            className="btn-primary"
                            onClick={() => {
                              setReplyingMessageId((current) => (current === message.id ? null : message.id))
                              setEmailReplySubject(message.subject?.startsWith('Re:') ? message.subject : `Re: ${message.subject || 'Quick follow-up'}`)
                            }}
                          >
                            Reply
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {replyingMessageId === message.id ? (
                      <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
                        <input className="input-base" value={emailReplySubject} onChange={(event) => setEmailReplySubject(event.target.value)} placeholder="Reply subject" />
                        <textarea
                          className="input-base"
                          value={emailReplyBody}
                          onChange={(event) => setEmailReplyBody(event.target.value)}
                          style={{ minHeight: '140px', resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn-primary" onClick={() => void runEmailAction(message, 'reply')} disabled={busyAction === `reply:${message.id}`}>
                            {busyAction === `reply:${message.id}` ? 'Sending...' : 'Send reply'}
                          </button>
                          <button className="btn-ghost" onClick={() => setReplyingMessageId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Surface>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0,1fr)', gap: '18px' }}>
          <Surface style={{ display: 'grid', gap: '12px', alignContent: 'start' }}>
            <select className="input-base" value={selectedWhatsappAccountId} onChange={(event) => setSelectedWhatsappAccountId(event.target.value)}>
              <option value="">All WhatsApp accounts</option>
              {whatsappAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName}
                </option>
              ))}
            </select>
            <input className="input-base" value={waSearch} onChange={(event) => setWaSearch(event.target.value)} placeholder="Search phone, name, or message text" />
            <button className="btn-ghost" onClick={() => void clearSyncedData('whatsapp')} disabled={busyAction === 'clear:whatsapp'}>
              {busyAction === 'clear:whatsapp' ? 'Clearing...' : 'Clear WhatsApp cache'}
            </button>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Only conversations started by this software are listed here.
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {whatsappLoading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading conversations...</div>
              ) : waConversations.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No managed WhatsApp conversations yet.</div>
              ) : (
                waConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    className="btn-ghost"
                    onClick={() => startTransition(() => setSelectedConversationId(conversation.id))}
                    style={{
                      textAlign: 'left',
                      justifyContent: 'flex-start',
                      padding: '14px',
                      background: selectedConversationId === conversation.id ? 'rgba(99,102,241,0.12)' : undefined,
                    }}
                  >
                    <div style={{ display: 'grid', gap: '6px', width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {conversation.participantName || conversation.participantPhone || conversation.participantJid}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {formatDate(conversation.lastMessageAt)}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {conversation.whatsappAccount.displayName}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {conversation.lastMessage ? `${conversation.lastMessage.direction === 'outbound' ? 'You' : 'Contact'}: ${conversation.lastMessage.body}` : 'No messages'}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Surface>

          <Surface style={{ minHeight: '620px', display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: '12px' }}>
            {selectedConversation ? (
              <>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedConversation.participantName || selectedConversation.participantPhone || selectedConversation.participantJid}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Routed through {selectedConversation.whatsappAccount.displayName} | {selectedConversation.whatsappAccount.connectionStatus}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '10px', alignContent: 'start', overflowY: 'auto', paddingRight: '4px' }}>
                  {selectedConversation.messages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        maxWidth: '78%',
                        justifySelf: message.direction === 'outbound' ? 'end' : 'start',
                        padding: '12px 14px',
                        borderRadius: message.direction === 'outbound' ? '16px 16px 6px 16px' : '16px 16px 16px 6px',
                        background: message.direction === 'outbound' ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-primary)' }}>{message.body}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        {formatDate(message.sentAt || message.receivedAt || message.createdAt)}
                        {message.status ? ` | ${message.status}` : ''}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gap: '10px' }}>
                  <textarea
                    className="input-base"
                    value={waComposer}
                    onChange={(event) => setWaComposer(event.target.value)}
                    placeholder="Reply to this conversation"
                    style={{ minHeight: '120px', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Sending through the worker keeps this inbox aligned with campaign/API WhatsApp traffic.
                    </div>
                    <button className="btn-primary" onClick={() => void sendWhatsappReply()} disabled={busyAction === `whatsapp:${selectedConversation.id}` || !waComposer.trim()}>
                      {busyAction === `whatsapp:${selectedConversation.id}` ? 'Queueing...' : 'Send WhatsApp reply'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Select a managed WhatsApp conversation to view replies.</div>
            )}
          </Surface>
        </div>
      )}
    </div>
  )
}
