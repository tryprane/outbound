'use client'

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { PaginationControls } from '@/components/ui/pagination-controls'

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

type EmailMessageModalState = {
  id: string
  subject: string | null
  fromEmail: string | null
  toEmail: string | null
  sentAt: string | null
  receivedAt: string | null
  html: string | null
  text: string | null
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
}

type WhatsAppConversationMessage = {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  status: string | null
  sentAt: string | null
  receivedAt: string | null
  createdAt: string
}

type InboxRetention = {
  emailDays: number
  whatsappDays: number
}

type PaginatedPayload<T> = {
  items: T[]
  total: number
  page: number
  pages: number
  limit: number
}

function emptyPage<T>(limit: number): PaginatedPayload<T> {
  return { items: [], total: 0, page: 1, pages: 1, limit }
}

function formatDate(value?: string | null) {
  if (!value) return 'No timestamp'
  return new Date(value).toLocaleString()
}

async function readJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url)
    return (await response.json()) as T
  } catch {
    return fallback
  }
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
  const [emailData, setEmailData] = useState<PaginatedPayload<EmailInboxMessage>>(emptyPage(25))
  const [emailLoading, setEmailLoading] = useState(true)
  const [emailPage, setEmailPage] = useState(1)
  const [emailLimit, setEmailLimit] = useState(25)
  const [replyingMessageId, setReplyingMessageId] = useState<string | null>(null)
  const [emailReplySubject, setEmailReplySubject] = useState('Re: Quick follow-up')
  const [emailReplyBody, setEmailReplyBody] = useState('<p>Thanks for your message. Sharing a quick follow-up from the unified inbox.</p>')
  const [isClient, setIsClient] = useState(false)
  const [messageModal, setMessageModal] = useState<EmailMessageModalState | null>(null)
  const [messageLoadingId, setMessageLoadingId] = useState<string | null>(null)
  const [messageError, setMessageError] = useState<string | null>(null)
  const [waSearch, setWaSearch] = useState('')
  const deferredWaSearch = useDeferredValue(waSearch)
  const [selectedWhatsappAccountId, setSelectedWhatsappAccountId] = useState('')
  const [waConversationData, setWaConversationData] = useState<PaginatedPayload<WhatsAppConversationSummary>>(emptyPage(20))
  const [waConversationPage, setWaConversationPage] = useState(1)
  const [waConversationLimit, setWaConversationLimit] = useState(20)
  const [whatsappLoading, setWhatsappLoading] = useState(true)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<WhatsAppConversationDetail | null>(null)
  const [waMessageData, setWaMessageData] = useState<PaginatedPayload<WhatsAppConversationMessage>>(emptyPage(30))
  const [waMessagePage, setWaMessagePage] = useState(1)
  const [waMessageLimit, setWaMessageLimit] = useState(30)
  const [waComposer, setWaComposer] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const loadAccountsAndSettings = async () => {
      const [mailRes, waRes] = await Promise.all([
        readJson<PaginatedPayload<MailAccountOption>>('/api/mail-accounts?view=selector&page=1&limit=100', emptyPage(100)),
        readJson<PaginatedPayload<WhatsAppAccountOption>>('/api/mail-accounts?resource=whatsapp-accounts&view=selector&page=1&limit=100', emptyPage(100)),
      ])
      setMailAccounts(mailRes.items || [])
      setWhatsappAccounts(waRes.items || [])

      const settings = await readJson<{
        workspace?: {
          inboxPageSize?: number
          whatsappInboxPageSize?: number
          includeWarmupInInbox?: boolean
        }
      }>('/api/settings', {})
      if (settings.workspace?.inboxPageSize) setEmailLimit(settings.workspace.inboxPageSize)
      if (settings.workspace?.whatsappInboxPageSize) setWaConversationLimit(settings.workspace.whatsappInboxPageSize)
      if (settings.workspace?.whatsappInboxPageSize) setWaMessageLimit(settings.workspace.whatsappInboxPageSize)
      if (typeof settings.workspace?.includeWarmupInInbox === 'boolean') {
        setIncludeWarmup(settings.workspace.includeWarmupInInbox)
      }
    }
    void loadAccountsAndSettings()
  }, [])

  const loadEmail = useCallback(async () => {
    setEmailLoading(true)
    const params = new URLSearchParams({
      channel: 'email',
      folderKind: emailFolder,
      page: String(emailPage),
      limit: String(emailLimit),
    })
    if (selectedMailAccountId) params.set('mailAccountId', selectedMailAccountId)
    if (includeWarmup) params.set('includeWarmup', 'true')
    if (deferredSearch.trim()) params.set('search', deferredSearch.trim())

    const data = await readJson<PaginatedPayload<EmailInboxMessage> & { retention?: InboxRetention; messages?: EmailInboxMessage[] }>(
      `/api/inbox?${params.toString()}`,
      { ...emptyPage(emailLimit), messages: [] }
    )
    setEmailData({
      items: data.items || data.messages || [],
      total: data.total || 0,
      page: data.page || 1,
      pages: data.pages || 1,
      limit: data.limit || emailLimit,
    })
    if (data.retention) setRetention(data.retention)
    setEmailLoading(false)
  }, [deferredSearch, emailFolder, emailLimit, emailPage, includeWarmup, selectedMailAccountId])

  const loadWhatsApp = useCallback(async () => {
    setWhatsappLoading(true)
    const params = new URLSearchParams({
      channel: 'whatsapp',
      page: String(waConversationPage),
      limit: String(waConversationLimit),
      messagePage: String(waMessagePage),
      messageLimit: String(waMessageLimit),
    })
    if (selectedWhatsappAccountId) params.set('whatsappAccountId', selectedWhatsappAccountId)
    if (selectedConversationId) params.set('conversationId', selectedConversationId)
    if (deferredWaSearch.trim()) params.set('search', deferredWaSearch.trim())

    const data = await readJson<{
      retention?: InboxRetention
      conversations?: WhatsAppConversationSummary[]
      items?: WhatsAppConversationSummary[]
      total?: number
      page?: number
      pages?: number
      limit?: number
      selectedConversation?: WhatsAppConversationDetail | null
      selectedConversationMessages?: WhatsAppConversationMessage[]
      selectedConversationTotal?: number
      messagePage?: number
      messagePages?: number
      messageLimit?: number
    }>(
      `/api/inbox?${params.toString()}`,
      {}
    )

    const conversations = data.items || data.conversations || []
    setWaConversationData({
      items: conversations,
      total: data.total || 0,
      page: data.page || 1,
      pages: data.pages || 1,
      limit: data.limit || waConversationLimit,
    })
    setSelectedConversation((data.selectedConversation as WhatsAppConversationDetail | null) ?? null)
    if (!selectedConversationId && conversations[0]?.id) {
      setSelectedConversationId(conversations[0].id)
    }
    setWaMessageData({
      items: data.selectedConversationMessages || [],
      total: data.selectedConversationTotal || 0,
      page: data.messagePage || 1,
      pages: data.messagePages || 1,
      limit: data.messageLimit || waMessageLimit,
    })
    if (data.retention) setRetention(data.retention)
    setWhatsappLoading(false)
  }, [deferredWaSearch, selectedConversationId, selectedWhatsappAccountId, waConversationLimit, waConversationPage, waMessageLimit, waMessagePage])

  useEffect(() => {
    if (activeChannel === 'email') {
      void loadEmail()
    }
  }, [activeChannel, loadEmail])

  useEffect(() => {
    if (activeChannel === 'whatsapp') {
      void loadWhatsApp()
    }
  }, [activeChannel, loadWhatsApp])

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
    await loadEmail()
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
    await loadWhatsApp()
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
    if (scope === 'all' || scope === 'email') {
      setEmailData(emptyPage(emailLimit))
    }
    if (scope === 'all' || scope === 'whatsapp') {
      setWaConversationData(emptyPage(waConversationLimit))
      setSelectedConversation(null)
      setWaMessageData(emptyPage(waMessageLimit))
    }
  }

  async function openEmailMessage(message: EmailInboxMessage) {
    setMessageError(null)
    setMessageLoadingId(message.id)

    try {
      const response = await fetch(`/api/inbox/${message.id}/message`)
      const data = await response.json().catch(() => ({ error: 'Failed to load message content' }))

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load message content')
      }

      setMessageModal({
        id: message.id,
        subject: data.subject ?? message.subject,
        fromEmail: data.fromEmail ?? message.fromEmail,
        toEmail: data.toEmail ?? message.toEmail,
        sentAt: data.sentAt ?? message.sentAt,
        receivedAt: data.receivedAt ?? message.receivedAt,
        html: data.html ?? null,
        text: data.text ?? null,
      })
    } catch (error) {
      const nextError = error instanceof Error ? error.message : 'Failed to load message content'
      setMessageError(nextError)
      setToast({ type: 'error', message: nextError })
    } finally {
      setMessageLoadingId(null)
    }
  }

  useEffect(() => {
    if (!messageModal) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMessageModal(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [messageModal])

  return (
    <div className="animate-fade-in space-y-6">
      {toast ? (
        <div
          className={`fixed right-5 top-5 z-[100] rounded-2xl border px-4 py-3 text-sm shadow-lg ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <section className="page-shell rounded-[34px] border border-white/70 px-8 py-8 shadow-[0_28px_80px_rgba(60,45,25,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl space-y-3">
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Unified inbox</div>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[var(--text-primary)]">
              Review email replies and managed WhatsApp conversations without forced refresh loops.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
              Email shows synced mailbox traffic across connected inboxes. WhatsApp shows only conversations this software owns. Cached history is retained for {activeRetentionLabel} and can be cleared manually.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={activeChannel === 'email' ? 'btn-primary' : 'btn-ghost'} onClick={() => startTransition(() => setActiveChannel('email'))}>
              Email Inbox
            </button>
            <button className={activeChannel === 'whatsapp' ? 'btn-primary' : 'btn-ghost'} onClick={() => startTransition(() => setActiveChannel('whatsapp'))}>
              WhatsApp Inbox
            </button>
            <button className="btn-ghost" onClick={() => void (activeChannel === 'email' ? loadEmail() : loadWhatsApp())}>
              Refresh
            </button>
            <button className="btn-ghost" onClick={() => void clearSyncedData(activeChannel)} disabled={busyAction === `clear:${activeChannel}`}>
              {busyAction === `clear:${activeChannel}` ? 'Clearing...' : `Clear ${activeChannel} cache`}
            </button>
          </div>
        </div>
      </section>

      {activeChannel === 'email' ? (
        <>
          <section className="rounded-[28px] border border-black/8 bg-white/90 p-6">
            <div className="grid gap-3 lg:grid-cols-4">
              <select className="input-base" value={emailFolder} onChange={(event) => { setEmailFolder(event.target.value as 'INBOX' | 'SPAM' | 'SENT'); setEmailPage(1) }}>
                <option value="INBOX">Inbox</option>
                <option value="SPAM">Spam</option>
                <option value="SENT">Sent</option>
              </select>
              <select className="input-base" value={selectedMailAccountId} onChange={(event) => { setSelectedMailAccountId(event.target.value); setEmailPage(1) }}>
                <option value="">All mail accounts</option>
                {mailAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email}
                  </option>
                ))}
              </select>
              <input className="input-base" value={search} onChange={(event) => { setSearch(event.target.value); setEmailPage(1) }} placeholder="Search subject, snippet, sender, or recipient" />
              <label className="flex items-center gap-3 rounded-2xl border border-black/8 bg-[#fcfbf8] px-4 text-sm text-[var(--text-secondary)]">
                <input type="checkbox" checked={includeWarmup} onChange={(event) => { setIncludeWarmup(event.target.checked); setEmailPage(1) }} />
                Include warmup mail
              </label>
            </div>
            <div className="mt-3 text-sm text-[var(--text-secondary)]">
              Viewing {selectedEmailCountLabel}. Folder: {emailFolder}. Total messages: {emailData.total}.
            </div>
          </section>

          <section className="rounded-[28px] border border-black/8 bg-white/90 p-6">
            {emailLoading ? (
              <div className="py-12 text-sm text-[var(--text-muted)]">Loading inbox…</div>
            ) : emailData.items.length === 0 ? (
              <div className="py-12 text-sm text-[var(--text-muted)]">No synced email found for this view.</div>
            ) : (
              <div className="space-y-4">
                {emailData.items.map((message) => (
                  <div key={message.id} className="rounded-[24px] border border-black/8 bg-[#fcfbf8] p-5">
                    <div className="flex flex-wrap justify-between gap-4">
                      <div className="max-w-3xl">
                        <div className="text-base font-semibold text-[var(--text-primary)]">{message.subject || '(no subject)'}</div>
                        <div className="mt-2 text-sm text-[var(--text-secondary)]">
                          {message.direction === 'inbound' ? `From ${message.fromEmail || 'Unknown'}` : `To ${message.toEmail || 'Unknown'}`} via {message.mailAccount.email}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {formatDate(message.receivedAt || message.sentAt)} • {message.folderKind} • {message.isRead ? 'Read' : 'Unread'}
                          {message.isWarmup ? ' • Warmup' : ''}
                          {message.repliedAt ? ' • Replied' : ''}
                        </div>
                        {message.snippet ? (
                          <div className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{message.snippet}</div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap content-start gap-2">
                        <button className="btn-ghost" onClick={() => void openEmailMessage(message)} disabled={messageLoadingId === message.id}>
                          {messageLoadingId === message.id ? 'Loading...' : 'View message'}
                        </button>
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
                      <div className="mt-4 grid gap-3">
                        <input className="input-base" value={emailReplySubject} onChange={(event) => setEmailReplySubject(event.target.value)} placeholder="Reply subject" />
                        <textarea
                          className="input-base min-h-[140px] resize-y"
                          value={emailReplyBody}
                          onChange={(event) => setEmailReplyBody(event.target.value)}
                        />
                        <div className="flex gap-2">
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
            <div className="mt-5">
              <PaginationControls
                page={emailData.page}
                pages={emailData.pages}
                total={emailData.total}
                limit={emailData.limit}
                onPageChange={setEmailPage}
                onLimitChange={(limit) => {
                  setEmailLimit(limit)
                  setEmailPage(1)
                }}
                label="messages"
              />
            </div>
          </section>
        </>
      ) : (
        <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-4 rounded-[28px] border border-black/8 bg-white/90 p-6">
            <div className="grid gap-3">
              <select className="input-base" value={selectedWhatsappAccountId} onChange={(event) => { setSelectedWhatsappAccountId(event.target.value); setWaConversationPage(1) }}>
                <option value="">All WhatsApp accounts</option>
                {whatsappAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName}
                  </option>
                ))}
              </select>
              <input className="input-base" value={waSearch} onChange={(event) => { setWaSearch(event.target.value); setWaConversationPage(1) }} placeholder="Search phone, name, or message text" />
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              Only software-managed conversations are listed here.
            </div>
            <div className="space-y-3">
              {whatsappLoading ? (
                <div className="py-10 text-sm text-[var(--text-muted)]">Loading conversations…</div>
              ) : waConversationData.items.length === 0 ? (
                <div className="py-10 text-sm text-[var(--text-muted)]">No managed WhatsApp conversations yet.</div>
              ) : (
                waConversationData.items.map((conversation) => (
                  <button
                    key={conversation.id}
                    className="w-full rounded-[22px] border border-black/8 bg-[#fcfbf8] p-4 text-left transition hover:border-[var(--accent)]"
                    onClick={() => startTransition(() => { setSelectedConversationId(conversation.id); setWaMessagePage(1) })}
                    style={selectedConversationId === conversation.id ? { borderColor: 'var(--accent)', background: 'rgba(242,236,226,0.9)' } : undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">
                          {conversation.participantName || conversation.participantPhone || conversation.participantJid}
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-secondary)]">
                          {conversation.whatsappAccount.displayName}
                        </div>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">{formatDate(conversation.lastMessageAt)}</div>
                    </div>
                    <div className="mt-3 text-sm text-[var(--text-secondary)] line-clamp-2">
                      {conversation.lastMessage ? `${conversation.lastMessage.direction === 'outbound' ? 'You' : 'Contact'}: ${conversation.lastMessage.body}` : 'No messages'}
                    </div>
                  </button>
                ))
              )}
            </div>
            <PaginationControls
              page={waConversationData.page}
              pages={waConversationData.pages}
              total={waConversationData.total}
              limit={waConversationData.limit}
              onPageChange={setWaConversationPage}
              onLimitChange={(limit) => {
                setWaConversationLimit(limit)
                setWaConversationPage(1)
              }}
              label="conversations"
            />
          </div>

          <div className="rounded-[28px] border border-black/8 bg-white/90 p-6">
            {selectedConversation ? (
              <div className="grid min-h-[680px] grid-rows-[auto_1fr_auto] gap-4">
                <div className="border-b border-black/8 pb-4">
                  <div className="text-xl font-semibold text-[var(--text-primary)]">
                    {selectedConversation.participantName || selectedConversation.participantPhone || selectedConversation.participantJid}
                  </div>
                  <div className="mt-1 text-sm text-[var(--text-secondary)]">
                    Routed through {selectedConversation.whatsappAccount.displayName} • {selectedConversation.whatsappAccount.connectionStatus}
                  </div>
                </div>

                <div className="grid gap-3 content-start overflow-y-auto pr-1">
                  {waMessageData.items.map((message) => (
                    <div
                      key={message.id}
                      className="max-w-[78%] rounded-[18px] px-4 py-3"
                      style={{
                        justifySelf: message.direction === 'outbound' ? 'end' : 'start',
                        background: message.direction === 'outbound' ? 'rgba(214,170,102,0.16)' : '#fcfbf8',
                        border: '1px solid rgba(60,45,25,0.08)',
                      }}
                    >
                      <div className="text-sm leading-6 text-[var(--text-primary)]">{message.body}</div>
                      <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        {formatDate(message.sentAt || message.receivedAt || message.createdAt)}
                        {message.status ? ` • ${message.status}` : ''}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 border-t border-black/8 pt-4">
                  <PaginationControls
                    page={waMessageData.page}
                    pages={waMessageData.pages}
                    total={waMessageData.total}
                    limit={waMessageData.limit}
                    onPageChange={setWaMessagePage}
                    onLimitChange={(limit) => {
                      setWaMessageLimit(limit)
                      setWaMessagePage(1)
                    }}
                    label="messages"
                  />
                  <textarea
                    className="input-base min-h-[120px] resize-y"
                    value={waComposer}
                    onChange={(event) => setWaComposer(event.target.value)}
                    placeholder="Reply to this conversation"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-[var(--text-secondary)]">
                      Sending through the worker keeps this inbox aligned with campaign and API WhatsApp traffic.
                    </div>
                    <button className="btn-primary" onClick={() => void sendWhatsappReply()} disabled={busyAction === `whatsapp:${selectedConversation.id}` || !waComposer.trim()}>
                      {busyAction === `whatsapp:${selectedConversation.id}` ? 'Queueing...' : 'Send WhatsApp reply'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-20 text-sm text-[var(--text-muted)]">
                Select a managed WhatsApp conversation to view replies.
              </div>
            )}
          </div>
        </section>
      )}

      {messageError ? (
        <div className="rounded-[20px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
          {messageError}
        </div>
      ) : null}

      {isClient && messageModal ? createPortal(
        <div
          onClick={() => setMessageModal(null)}
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
            className="rounded-[28px] border border-black/8 bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(980px, 100%)',
              maxHeight: 'min(88vh, 1040px)',
              overflowY: 'auto',
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/8 pb-4">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Full message</div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                  {messageModal.subject || '(no subject)'}
                </h2>
                <div className="text-sm leading-6 text-[var(--text-secondary)]">
                  {messageModal.fromEmail ? `From ${messageModal.fromEmail}` : 'Unknown sender'}
                  {messageModal.toEmail ? ` to ${messageModal.toEmail}` : ''}
                </div>
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  {formatDate(messageModal.receivedAt || messageModal.sentAt)}
                </div>
              </div>
              <button className="btn-ghost" onClick={() => setMessageModal(null)}>
                Close
              </button>
            </div>

            <div className="mt-5 overflow-hidden rounded-[22px] border border-black/8 bg-[#fcfbf8]">
              {messageModal.html ? (
                <iframe
                  title={messageModal.subject || 'Inbox message'}
                  srcDoc={messageModal.html}
                  sandbox=""
                  style={{
                    width: '100%',
                    minHeight: '70vh',
                    border: '0',
                    background: 'white',
                  }}
                />
              ) : (
                <div className="p-5 text-sm leading-7 text-[var(--text-primary)] whitespace-pre-wrap">
                  {messageModal.text || 'No full message content is available for this email yet.'}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  )
}
