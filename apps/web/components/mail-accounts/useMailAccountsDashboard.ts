'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  createWarmupRecipient,
  createWhatsappAccount,
  deleteMailAccount,
  deleteWarmupRecipient,
  deleteWhatsappAccount,
  fetchDomainDiagnostics,
  fetchMailboxMessages,
  patchMailboxMessage,
  patchMailAccount,
  patchWarmupRecipient,
  patchWhatsappAccount,
} from '@/lib/mailAccountsClient'
import type {
  ActiveTab,
  DomainDiagnostics,
  MailAccount,
  MailboxMessage,
  PaginatedResponse,
  WarmupLog,
  WarmupOverview,
  WarmupRecipient,
  WhatsAppAccount,
} from '@/components/mail-accounts/types'

async function readJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url)
    const data = await response.json()
    return data as T
  } catch {
    return fallback
  }
}

function emptyPage<T>(limit: number): PaginatedResponse<T> {
  return {
    items: [],
    total: 0,
    page: 1,
    pages: 1,
    limit,
  }
}

export function useMailAccountsDashboard() {
  const searchParams = useSearchParams()
  const [accountsPage, setAccountsPage] = useState(1)
  const [accountsLimit, setAccountsLimit] = useState(10)
  const [accountsData, setAccountsData] = useState<PaginatedResponse<MailAccount>>(emptyPage(10))
  const [whatsAppPage, setWhatsAppPage] = useState(1)
  const [whatsAppLimit, setWhatsAppLimit] = useState(10)
  const [whatsAppData, setWhatsAppData] = useState<PaginatedResponse<WhatsAppAccount>>(emptyPage(10))
  const [recipientPage, setRecipientPage] = useState(1)
  const [recipientLimit, setRecipientLimit] = useState(10)
  const [recipientData, setRecipientData] = useState<PaginatedResponse<WarmupRecipient>>(emptyPage(10))
  const [warmupLogPage, setWarmupLogPage] = useState(1)
  const [warmupLogLimit, setWarmupLogLimit] = useState(10)
  const [warmupLogData, setWarmupLogData] = useState<PaginatedResponse<WarmupLog>>(emptyPage(10))
  const [warmupOverview, setWarmupOverview] = useState<WarmupOverview | null>(null)
  const [domainDiagnostics, setDomainDiagnostics] = useState<DomainDiagnostics[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('accounts')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [pendingDailyLimits, setPendingDailyLimits] = useState<Record<string, string>>({})
  const [waForm, setWaForm] = useState({ displayName: '', phoneNumber: '', dailyLimit: 40 })
  const [waSaving, setWaSaving] = useState(false)
  const [recipientForm, setRecipientForm] = useState({ email: '', name: '', isActive: true })
  const [recipientSaving, setRecipientSaving] = useState(false)
  const [bulkRecipients, setBulkRecipients] = useState('')
  const [activeMailboxAccountId, setActiveMailboxAccountId] = useState<string | null>(null)
  const [activeMailboxFolder, setActiveMailboxFolder] = useState<'INBOX' | 'SPAM' | 'SENT'>('INBOX')
  const [mailboxPage, setMailboxPage] = useState(1)
  const [mailboxLimit, setMailboxLimit] = useState(25)
  const [mailboxData, setMailboxData] = useState<PaginatedResponse<MailboxMessage>>(emptyPage(25))
  const [mailboxLoading, setMailboxLoading] = useState(false)

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }, [])

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    if (success) showToast('success', decodeURIComponent(success))
    if (error) showToast('error', decodeURIComponent(error))
  }, [searchParams, showToast])

  const loadMailboxMessages = useCallback(async (
    mailAccountId: string,
    folderKind: 'INBOX' | 'SPAM' | 'SENT',
    page = 1,
    limit = mailboxLimit
  ) => {
    setMailboxLoading(true)
    const sp = new URLSearchParams({
      resource: 'mailbox-messages',
      mailAccountId,
      folderKind,
      page: String(page),
      limit: String(limit),
    })
    const result = await readJson<PaginatedResponse<MailboxMessage>>(
      `/api/mail-accounts?${sp.toString()}`,
      emptyPage(limit)
    )
    setMailboxData(result)
    setMailboxPage(result.page)
    setMailboxLimit(result.limit)
    setMailboxLoading(false)
  }, [mailboxLimit])

  const loadAll = useCallback(async (background = false) => {
    if (!background) setLoading(true)

    const [
      accounts,
      whatsappAccounts,
      warmupRecipients,
      overview,
      warmupLogs,
      diagnostics,
    ] = await Promise.all([
      readJson<PaginatedResponse<MailAccount>>(
        `/api/mail-accounts?page=${accountsPage}&limit=${accountsLimit}`,
        emptyPage(accountsLimit)
      ),
      readJson<PaginatedResponse<WhatsAppAccount>>(
        `/api/mail-accounts?resource=whatsapp-accounts&page=${whatsAppPage}&limit=${whatsAppLimit}`,
        emptyPage(whatsAppLimit)
      ),
      readJson<PaginatedResponse<WarmupRecipient>>(
        `/api/mail-accounts?resource=warmup-recipients&page=${recipientPage}&limit=${recipientLimit}`,
        emptyPage(recipientLimit)
      ),
      readJson<WarmupOverview | null>('/api/mail-accounts?resource=warmup-overview', null),
      readJson<PaginatedResponse<WarmupLog>>(
        `/api/mail-accounts?resource=warmup-logs&page=${warmupLogPage}&limit=${warmupLogLimit}`,
        emptyPage(warmupLogLimit)
      ),
      fetchDomainDiagnostics(),
    ])

    setAccountsData(accounts)
    setWhatsAppData(whatsappAccounts)
    setRecipientData(warmupRecipients)
    setWarmupOverview(overview)
    setWarmupLogData(warmupLogs)
    setDomainDiagnostics(Array.isArray(diagnostics) ? diagnostics : [])

    if (!background) setLoading(false)
  }, [accountsLimit, accountsPage, recipientLimit, recipientPage, warmupLogLimit, warmupLogPage, whatsAppLimit, whatsAppPage])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    setPendingDailyLimits((prev) => {
      const next: Record<string, string> = {}
      for (const account of accountsData.items) {
        next[account.id] = prev[account.id] ?? String(account.dailyLimit)
      }
      return next
    })
  }, [accountsData.items])

  const handlePatchMailAccount = useCallback(async (body: Record<string, unknown>, successMessage?: string) => {
    const res = await patchMailAccount(body)
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Update failed' }))
      showToast('error', data.error || 'Update failed')
      return false
    }
    if (successMessage) showToast('success', successMessage)
    void loadAll(true)
    return true
  }, [loadAll, showToast])

  const handleToggleMailActive = useCallback(async (id: string, current: boolean, warmupStatus: MailAccount['warmupStatus']) => {
    const account = accountsData.items.find((item) => item.id === id)
    if (account?.type === 'zoho' && account.connectionReady === false) {
      showToast('error', 'Finish both Zoho SMTP and OAuth on the same email before activating this mailbox.')
      return
    }
    if (!current && warmupStatus !== 'WARMED') {
      showToast('error', 'Only WARMED mailboxes can be activated.')
      return
    }
    await handlePatchMailAccount({ id, isActive: !current })
  }, [accountsData.items, handlePatchMailAccount, showToast])

  const handleWarmupStatusChange = useCallback(async (id: string, warmupStatus: MailAccount['warmupStatus']) => {
    await handlePatchMailAccount({ id, warmupStatus }, `Warmup status updated to ${warmupStatus}`)
  }, [handlePatchMailAccount])

  const handleWarmupAutoToggle = useCallback(async (id: string, current: boolean) => {
    await handlePatchMailAccount({ id, warmupAutoEnabled: !current })
  }, [handlePatchMailAccount])

  const handleUpdateMailDailyLimit = useCallback(async (id: string) => {
    const rawValue = pendingDailyLimits[id]
    const dailyLimit = Math.max(1, Number(rawValue || 1))
    await handlePatchMailAccount({ id, dailyLimit }, 'Daily send limit updated')
  }, [handlePatchMailAccount, pendingDailyLimits])

  const handleZohoImapToggle = useCallback(async (id: string, current: boolean) => {
    await handlePatchMailAccount({ id, zohoImapEnabled: !current }, `Zoho IMAP turned ${current ? 'off' : 'on'}`)
  }, [handlePatchMailAccount])

  const handleUseZohoApi = useCallback(async (id: string) => {
    await handlePatchMailAccount({ id, zohoMailboxMode: 'api' }, 'Zoho mailbox switched to API mode')
  }, [handlePatchMailAccount])

  const handleOpenMailboxFolder = useCallback(async (mailAccountId: string, folderKind: 'INBOX' | 'SPAM' | 'SENT') => {
    setActiveMailboxAccountId(mailAccountId)
    setActiveMailboxFolder(folderKind)
    await loadMailboxMessages(mailAccountId, folderKind, 1)
  }, [loadMailboxMessages])

  const handleMailboxPageChange = useCallback(async (page: number) => {
    if (!activeMailboxAccountId) return
    await loadMailboxMessages(activeMailboxAccountId, activeMailboxFolder, page)
  }, [activeMailboxAccountId, activeMailboxFolder, loadMailboxMessages])

  const handleMailboxLimitChange = useCallback(async (limit: number) => {
    setMailboxLimit(limit)
    if (!activeMailboxAccountId) return
    await loadMailboxMessages(activeMailboxAccountId, activeMailboxFolder, 1, limit)
  }, [activeMailboxAccountId, activeMailboxFolder, loadMailboxMessages])

  const handleMailboxAction = useCallback(async (
    mailAccountId: string,
    mailboxMessageId: string,
    action: 'mark-read' | 'rescue-to-inbox' | 'reply'
  ) => {
    const payload: Record<string, unknown> = { mailAccountId, mailboxMessageId, action }
    if (action === 'reply') {
      const html = window.prompt('Reply HTML/body', '<p>Thanks for your message. Sharing a quick reply from the dashboard.</p>')
      if (!html) return
      const subject = window.prompt('Reply subject', 'Re: Quick follow-up')
      payload.html = html
      payload.subject = subject || 'Re: Quick follow-up'
    }
    const res = await patchMailboxMessage(payload)
    const data = await res.json().catch(() => ({ error: 'Mailbox action failed' }))
    if (!res.ok) {
      showToast('error', data.error || 'Mailbox action failed')
      return
    }
    showToast('success', action === 'reply' ? 'Reply sent' : 'Mailbox updated')
    if (activeMailboxAccountId) {
      void loadMailboxMessages(activeMailboxAccountId, activeMailboxFolder, mailboxPage, mailboxLimit)
    }
    void loadAll(true)
  }, [activeMailboxAccountId, activeMailboxFolder, loadAll, loadMailboxMessages, mailboxLimit, mailboxPage, showToast])

  const handleCreateWarmupRecipient = useCallback(async () => {
    if (!recipientForm.email.trim()) {
      showToast('error', 'Recipient email is required')
      return
    }
    setRecipientSaving(true)
    const res = await createWarmupRecipient({
      email: recipientForm.email.trim(),
      name: recipientForm.name.trim() || undefined,
      isActive: recipientForm.isActive,
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
    setRecipientPage(1)
    void loadAll()
  }, [loadAll, recipientForm, showToast])

  const handleToggleWarmupRecipient = useCallback(async (id: string, current: boolean) => {
    const res = await patchWarmupRecipient({ id, isActive: !current })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to update warmup recipient' }))
      showToast('error', data.error || 'Failed to update warmup recipient')
      return
    }
    void loadAll(true)
  }, [loadAll, showToast])

  const handleBulkWarmupRecipients = useCallback(async () => {
    if (!bulkRecipients.trim()) {
      showToast('error', 'Paste at least one email address')
      return
    }
    setRecipientSaving(true)
    const res = await fetch('/api/mail-accounts?resource=warmup-recipients-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: bulkRecipients,
        isActive: recipientForm.isActive,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      showToast('error', data.error || 'Failed to import recipients')
      setRecipientSaving(false)
      return
    }
    showToast('success', `Imported ${data.count || 0} warmup recipients`)
    setBulkRecipients('')
    setRecipientSaving(false)
    setRecipientPage(1)
    void loadAll()
  }, [bulkRecipients, loadAll, recipientForm.isActive, showToast])

  const handleDeleteWarmupRecipient = useCallback(async (id: string, email: string) => {
    if (!confirm(`Remove warmup recipient "${email}"?`)) return
    const res = await deleteWarmupRecipient(id)
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to delete warmup recipient' }))
      showToast('error', data.error || 'Failed to delete warmup recipient')
      return
    }
    showToast('success', 'Warmup recipient removed')
    void loadAll(true)
  }, [loadAll, showToast])

  const handleRunWarmupNow = useCallback(async (id: string) => {
    await handlePatchMailAccount({ id, runWarmupNow: true }, 'Warmup tick queued. Watch the logs and sent count.')
  }, [handlePatchMailAccount])

  const handleRunMailboxSyncNow = useCallback(async (id: string) => {
    await handlePatchMailAccount({ id, runMailboxSyncNow: true }, 'Mailbox sync queued')
  }, [handlePatchMailAccount])

  const handleDeleteMail = useCallback(async (id: string, email: string) => {
    if (!confirm(`Remove ${email}?`)) return
    await deleteMailAccount(id)
    showToast('success', `${email} removed`)
    void loadAll(true)
  }, [loadAll, showToast])

  const handleCreateWhatsapp = useCallback(async () => {
    setWaSaving(true)
    const res = await createWhatsappAccount({
      displayName: waForm.displayName,
      phoneNumber: waForm.phoneNumber || undefined,
      dailyLimit: waForm.dailyLimit,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      showToast('error', data.error || 'Failed to add WhatsApp account')
      setWaSaving(false)
      return
    }
    showToast('success', 'WhatsApp account added. QR should appear in the accounts list.')
    setWaForm({ displayName: '', phoneNumber: '', dailyLimit: 40 })
    setActiveTab('accounts')
    setWaSaving(false)
    setWhatsAppPage(1)
    void loadAll()
  }, [loadAll, showToast, waForm])

  const handleToggleWhatsappActive = useCallback(async (id: string, current: boolean) => {
    const res = await patchWhatsappAccount({ id, isActive: !current })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to update WhatsApp account' }))
      showToast('error', data.error || 'Failed to update WhatsApp account')
      return
    }
    void loadAll(true)
  }, [loadAll, showToast])

  const handleUpdateWhatsappLimit = useCallback(async (id: string, dailyLimit: number) => {
    const res = await patchWhatsappAccount({ id, dailyLimit })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to update limit' }))
      showToast('error', data.error || 'Failed to update limit')
      return
    }
    void loadAll(true)
  }, [loadAll, showToast])

  const handleDeleteWhatsapp = useCallback(async (id: string, name: string) => {
    if (!confirm(`Remove WhatsApp account "${name}"?`)) return
    await deleteWhatsappAccount(id)
    showToast('success', `${name} removed`)
    void loadAll(true)
  }, [loadAll, showToast])

  const handleReconnectWhatsapp = useCallback(async (id: string) => {
    const res = await patchWhatsappAccount({ id, reconnect: true })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to reconnect WhatsApp account' }))
      showToast('error', data.error || 'Failed to reconnect WhatsApp account')
      return
    }
    showToast('success', 'Reconnect requested. QR will refresh shortly.')
    void loadAll(true)
  }, [loadAll, showToast])

  const handleReconnectGmail = useCallback(() => {
    window.location.href = '/api/mail-accounts/gmail'
  }, [])

  const handleReconnectZohoApi = useCallback(() => {
    window.location.href = '/api/mail-accounts/zoho/connect'
  }, [])

  const derived = useMemo(() => {
    const warmedAccounts = accountsData.items.filter((a) => a.warmupStatus === 'WARMED')
    const warmingAccounts = accountsData.items.filter((a) => a.warmupStatus === 'WARMING')
    const pausedAccounts = accountsData.items.filter((a) => a.warmupStatus === 'PAUSED')
    const autoWarmupAccounts = warmingAccounts.filter((a) => a.warmupAutoEnabled)
    const coldAccounts = accountsData.items.filter((a) => a.warmupStatus === 'COLD')
    const connectedWhatsapp = whatsAppData.items.filter((a) => a.connectionStatus === 'CONNECTED')
    const activeCustomRecipients = warmupOverview?.activeCustomRecipients ?? recipientData.items.filter((r) => r.isActive && !r.isSystem).length
    const activeMailboxPool = warmupOverview?.activeMailboxes ?? accountsData.items.filter((a) => a.isActive).length
    const recipientPoolHealthy = activeCustomRecipients > 0 || activeMailboxPool > 1
    const pausedGmailAccounts = accountsData.items.filter((a) => a.type === 'gmail' && a.warmupStatus === 'PAUSED')
    return {
      warmedAccounts,
      warmingAccounts,
      pausedAccounts,
      autoWarmupAccounts,
      coldAccounts,
      connectedWhatsapp,
      activeCustomRecipients,
      activeMailboxPool,
      recipientPoolHealthy,
      pausedGmailAccounts,
    }
  }, [accountsData.items, recipientData.items, warmupOverview, whatsAppData.items])

  return {
    accounts: accountsData.items,
    accountsPagination: accountsData,
    setAccountsPage,
    setAccountsLimit,
    whatsappAccounts: whatsAppData.items,
    whatsappPagination: whatsAppData,
    setWhatsAppPage,
    setWhatsAppLimit,
    warmupRecipients: recipientData.items,
    warmupRecipientsPagination: recipientData,
    setRecipientPage,
    setRecipientLimit,
    warmupOverview,
    warmupLogs: warmupLogData.items,
    warmupLogsPagination: warmupLogData,
    setWarmupLogPage,
    setWarmupLogLimit,
    domainDiagnostics,
    loading,
    activeTab,
    setActiveTab,
    toast,
    pendingDailyLimits,
    setPendingDailyLimits,
    waForm,
    setWaForm,
    waSaving,
    recipientForm,
    setRecipientForm,
    recipientSaving,
    bulkRecipients,
    setBulkRecipients,
    showToast,
    loadAll,
    handleToggleMailActive,
    handleWarmupStatusChange,
    handleWarmupAutoToggle,
    handleUpdateMailDailyLimit,
    handleZohoImapToggle,
    handleUseZohoApi,
    handleOpenMailboxFolder,
    handleMailboxAction,
    handleMailboxPageChange,
    handleMailboxLimitChange,
    handleCreateWarmupRecipient,
    handleToggleWarmupRecipient,
    handleBulkWarmupRecipients,
    handleDeleteWarmupRecipient,
    handleRunWarmupNow,
    handleRunMailboxSyncNow,
    handleDeleteMail,
    handleCreateWhatsapp,
    handleToggleWhatsappActive,
    handleUpdateWhatsappLimit,
    handleDeleteWhatsapp,
    handleReconnectWhatsapp,
    handleReconnectGmail,
    handleReconnectZohoApi,
    activeMailboxAccountId,
    activeMailboxFolder,
    mailboxMessages: mailboxData.items,
    mailboxPagination: mailboxData,
    mailboxLoading,
    ...derived,
  }
}
