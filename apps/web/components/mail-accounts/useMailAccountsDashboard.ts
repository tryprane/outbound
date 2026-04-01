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
  fetchMailAccountsDashboardData,
  importWarmupRecipients,
  patchMailAccount,
  patchWarmupRecipient,
  patchWhatsappAccount,
} from '@/lib/mailAccountsClient'
import type {
  ActiveTab,
  DomainDiagnostics,
  DomainHealthSnapshot,
  DomainHealthSummary,
  MailAccount,
  WarmupLog,
  WarmupOverview,
  WarmupRecipient,
  WhatsAppAccount,
} from '@/components/mail-accounts/types'

export function useMailAccountsDashboard() {
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<MailAccount[]>([])
  const [whatsappAccounts, setWhatsappAccounts] = useState<WhatsAppAccount[]>([])
  const [warmupRecipients, setWarmupRecipients] = useState<WarmupRecipient[]>([])
  const [warmupOverview, setWarmupOverview] = useState<WarmupOverview | null>(null)
  const [warmupLogs, setWarmupLogs] = useState<WarmupLog[]>([])
  const [domainDiagnostics, setDomainDiagnostics] = useState<DomainDiagnostics[]>([])
  const [domainHealth, setDomainHealth] = useState<DomainHealthSummary[]>([])
  const [domainHealthHistory, setDomainHealthHistory] = useState<DomainHealthSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('accounts')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [pendingDailyLimits, setPendingDailyLimits] = useState<Record<string, string>>({})
  const [waForm, setWaForm] = useState({ displayName: '', phoneNumber: '', dailyLimit: 40 })
  const [waSaving, setWaSaving] = useState(false)
  const [recipientForm, setRecipientForm] = useState({ email: '', name: '', isActive: true })
  const [recipientSaving, setRecipientSaving] = useState(false)
  const [bulkRecipients, setBulkRecipients] = useState('')

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

  const loadAll = useCallback(async (background = false) => {
    if (!background) setLoading(true)
    const result = await fetchMailAccountsDashboardData()
    setAccounts(Array.isArray(result.mailAccounts) ? result.mailAccounts : [])
    setWhatsappAccounts(Array.isArray(result.whatsappAccounts) ? result.whatsappAccounts : [])
    setWarmupRecipients(Array.isArray(result.warmupRecipients) ? result.warmupRecipients : [])
    setWarmupOverview(result.warmupOverview)
    setWarmupLogs(Array.isArray(result.warmupLogs) ? result.warmupLogs : [])
    setDomainHealth(Array.isArray(result.domainHealth.domains) ? result.domainHealth.domains : [])
    setDomainHealthHistory(Array.isArray(result.domainHealth.history) ? result.domainHealth.history : [])
    if (!background) setLoading(false)
  }, [])

  useEffect(() => {
    void loadAll()
    const timer = setInterval(() => void loadAll(true), 3_000)
    return () => clearInterval(timer)
  }, [loadAll])

  useEffect(() => {
    setPendingDailyLimits((prev) => {
      const next: Record<string, string> = {}
      for (const account of accounts) {
        next[account.id] = prev[account.id] ?? String(account.dailyLimit)
      }
      return next
    })
  }, [accounts])

  useEffect(() => {
    let cancelled = false
    const loadDiagnostics = async () => {
      const result = await fetchDomainDiagnostics()
      if (!cancelled) setDomainDiagnostics(Array.isArray(result) ? result : [])
    }
    void loadDiagnostics()
    const timer = setInterval(() => void loadDiagnostics(), 15 * 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const handlePatchMailAccount = useCallback(async (body: Record<string, unknown>, successMessage?: string) => {
    const res = await patchMailAccount(body)
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Update failed' }))
      showToast('error', data.error || 'Update failed')
      return false
    }
    if (successMessage) showToast('success', successMessage)
    void loadAll()
    return true
  }, [loadAll, showToast])

  const handleToggleMailActive = useCallback(async (id: string, current: boolean, warmupStatus: MailAccount['warmupStatus']) => {
    if (!current && warmupStatus !== 'WARMED') {
      showToast('error', 'Only WARMED mailboxes can be activated.')
      return
    }
    await handlePatchMailAccount({ id, isActive: !current })
  }, [handlePatchMailAccount, showToast])

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
    void loadAll()
  }, [loadAll, recipientForm, showToast])

  const handleToggleWarmupRecipient = useCallback(async (id: string, current: boolean) => {
    const res = await patchWarmupRecipient({ id, isActive: !current })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to update warmup recipient' }))
      showToast('error', data.error || 'Failed to update warmup recipient')
      return
    }
    void loadAll()
  }, [loadAll, showToast])

  const handleBulkWarmupRecipients = useCallback(async () => {
    if (!bulkRecipients.trim()) {
      showToast('error', 'Paste at least one email address')
      return
    }
    setRecipientSaving(true)
    const res = await importWarmupRecipients({
      entries: bulkRecipients,
      isActive: recipientForm.isActive,
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
    void loadAll()
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
    void loadAll()
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
    showToast('success', 'WhatsApp account added. Worker will generate QR shortly.')
    setWaForm({ displayName: '', phoneNumber: '', dailyLimit: 40 })
    setActiveTab('accounts')
    setWaSaving(false)
    void loadAll()
  }, [loadAll, showToast, waForm])

  const handleToggleWhatsappActive = useCallback(async (id: string, current: boolean) => {
    const res = await patchWhatsappAccount({ id, isActive: !current })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to update WhatsApp account' }))
      showToast('error', data.error || 'Failed to update WhatsApp account')
      return
    }
    void loadAll()
  }, [loadAll, showToast])

  const handleUpdateWhatsappLimit = useCallback(async (id: string, dailyLimit: number) => {
    const res = await patchWhatsappAccount({ id, dailyLimit })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to update limit' }))
      showToast('error', data.error || 'Failed to update limit')
      return
    }
    void loadAll()
  }, [loadAll, showToast])

  const handleDeleteWhatsapp = useCallback(async (id: string, name: string) => {
    if (!confirm(`Remove WhatsApp account "${name}"?`)) return
    await deleteWhatsappAccount(id)
    showToast('success', `${name} removed`)
    void loadAll()
  }, [loadAll, showToast])

  const handleReconnectWhatsapp = useCallback(async (id: string) => {
    const res = await patchWhatsappAccount({ id, reconnect: true })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to reconnect WhatsApp account' }))
      showToast('error', data.error || 'Failed to reconnect WhatsApp account')
      return
    }
    showToast('success', 'Reconnect requested. QR will refresh shortly.')
    void loadAll()
  }, [loadAll, showToast])

  const handleReconnectGmail = useCallback(() => {
    window.location.href = '/api/mail-accounts/gmail'
  }, [])

  const derived = useMemo(() => {
    const warmedAccounts = accounts.filter((a) => a.warmupStatus === 'WARMED')
    const warmingAccounts = accounts.filter((a) => a.warmupStatus === 'WARMING')
    const pausedAccounts = accounts.filter((a) => a.warmupStatus === 'PAUSED')
    const autoWarmupAccounts = warmingAccounts.filter((a) => a.warmupAutoEnabled)
    const coldAccounts = accounts.filter((a) => a.warmupStatus === 'COLD')
    const connectedWhatsapp = whatsappAccounts.filter((a) => a.connectionStatus === 'CONNECTED')
    const activeCustomRecipients = warmupRecipients.filter((r) => r.isActive && !r.isSystem).length
    const activeMailboxPool = accounts.filter((a) => a.isActive).length
    const recipientPoolHealthy = activeCustomRecipients > 0 || activeMailboxPool > 1
    const pausedGmailAccounts = accounts.filter((a) => a.type === 'gmail' && a.warmupStatus === 'PAUSED')
    const domainsWithWarnings = domainDiagnostics.filter((item) => item.warnings.length > 0)
    const criticalDomains = domainDiagnostics.filter((item) => item.severity === 'critical')
    const domainsAtRisk = domainHealth.filter((item) => item.healthStatus === 'at_risk' || item.healthStatus === 'paused')
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
      domainsWithWarnings,
      criticalDomains,
      domainsAtRisk,
    }
  }, [accounts, domainDiagnostics, domainHealth, warmupRecipients, whatsappAccounts])

  return {
    accounts,
    whatsappAccounts,
    warmupRecipients,
    warmupOverview,
    warmupLogs,
    domainDiagnostics,
    domainHealth,
    domainHealthHistory,
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
    ...derived,
  }
}
