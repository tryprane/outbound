'use client'

import { Suspense } from 'react'
import {
  AccountsView,
  AddGmailView,
  AddWhatsappView,
  AddZohoView,
  DomainPanels,
  MailAccountsHero,
  WarmupView,
} from '@/components/mail-accounts/MailAccountsSections'
import { useMailAccountsDashboard } from '@/components/mail-accounts/useMailAccountsDashboard'

function MailAccountsPageContent() {
  const dashboard = useMailAccountsDashboard()

  return (
    <div className="animate-fade-in">
      {dashboard.toast ? (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 99,
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '13px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: dashboard.toast.type === 'success' ? 'rgba(34,211,165,0.15)' : 'rgba(239,68,68,0.15)',
            color: dashboard.toast.type === 'success' ? 'var(--success)' : 'var(--error)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.25)',
          }}
        >
          {dashboard.toast.msg}
        </div>
      ) : null}

      <MailAccountsHero
        activeTab={dashboard.activeTab}
        setActiveTab={dashboard.setActiveTab}
        accountCount={dashboard.accounts.length}
        warmedCount={dashboard.warmedAccounts.length}
        whatsappCount={dashboard.whatsappAccounts.length}
        connectedWhatsappCount={dashboard.connectedWhatsapp.length}
        activeRecipients={dashboard.warmupRecipients.filter((r) => r.isActive).length}
        criticalDomains={dashboard.criticalDomains.length}
        riskyDomains={dashboard.domainsAtRisk.length}
      />

      <DomainPanels
        domainHealth={dashboard.domainHealth}
        domainHealthHistory={dashboard.domainHealthHistory}
        domainDiagnostics={dashboard.domainDiagnostics}
      />

      {dashboard.activeTab === 'accounts' ? (
        <AccountsView
          loading={dashboard.loading}
          accounts={dashboard.accounts}
          whatsappAccounts={dashboard.whatsappAccounts}
          pendingDailyLimits={dashboard.pendingDailyLimits}
          setPendingDailyLimits={dashboard.setPendingDailyLimits}
          handleWarmupStatusChange={dashboard.handleWarmupStatusChange}
          handleWarmupAutoToggle={dashboard.handleWarmupAutoToggle}
          handleUpdateMailDailyLimit={dashboard.handleUpdateMailDailyLimit}
          handleReconnectGmail={dashboard.handleReconnectGmail}
          handleReconnectZohoApi={dashboard.handleReconnectZohoApi}
          handleUseZohoApi={dashboard.handleUseZohoApi}
          handleZohoImapToggle={dashboard.handleZohoImapToggle}
          handleOpenMailboxFolder={dashboard.handleOpenMailboxFolder}
          handleMailboxAction={dashboard.handleMailboxAction}
          activeMailboxAccountId={dashboard.activeMailboxAccountId}
          activeMailboxFolder={dashboard.activeMailboxFolder}
          mailboxMessages={dashboard.mailboxMessages}
          mailboxLoading={dashboard.mailboxLoading}
          handleRunWarmupNow={dashboard.handleRunWarmupNow}
          handleRunMailboxSyncNow={dashboard.handleRunMailboxSyncNow}
          handleToggleMailActive={dashboard.handleToggleMailActive}
          handleDeleteMail={dashboard.handleDeleteMail}
          handleToggleWhatsappActive={dashboard.handleToggleWhatsappActive}
          handleUpdateWhatsappLimit={dashboard.handleUpdateWhatsappLimit}
          handleReconnectWhatsapp={dashboard.handleReconnectWhatsapp}
          handleDeleteWhatsapp={dashboard.handleDeleteWhatsapp}
        />
      ) : null}

      {dashboard.activeTab === 'warmup' ? (
        <WarmupView
          warmupOverview={dashboard.warmupOverview}
          loading={dashboard.loading}
          warmupRecipients={dashboard.warmupRecipients}
          recipientForm={dashboard.recipientForm}
          setRecipientForm={dashboard.setRecipientForm}
          recipientSaving={dashboard.recipientSaving}
          bulkRecipients={dashboard.bulkRecipients}
          setBulkRecipients={dashboard.setBulkRecipients}
          handleCreateWarmupRecipient={dashboard.handleCreateWarmupRecipient}
          handleBulkWarmupRecipients={dashboard.handleBulkWarmupRecipients}
          handleToggleWarmupRecipient={dashboard.handleToggleWarmupRecipient}
          handleDeleteWarmupRecipient={dashboard.handleDeleteWarmupRecipient}
          warmupLogs={dashboard.warmupLogs}
          recipientPoolHealthy={dashboard.recipientPoolHealthy}
          activeMailboxPool={dashboard.activeMailboxPool}
          activeCustomRecipients={dashboard.activeCustomRecipients}
        />
      ) : null}

      {dashboard.activeTab === 'add-zoho' ? (
        <AddZohoView
          onAdded={() => {
            void dashboard.loadAll()
            dashboard.showToast('success', 'Zoho setup step saved')
          }}
        />
      ) : null}

      {dashboard.activeTab === 'add-gmail' ? <AddGmailView /> : null}

      {dashboard.activeTab === 'add-whatsapp' ? (
        <AddWhatsappView
          waForm={dashboard.waForm}
          setWaForm={dashboard.setWaForm}
          waSaving={dashboard.waSaving}
          handleCreateWhatsapp={dashboard.handleCreateWhatsapp}
        />
      ) : null}
    </div>
  )
}

export default function MailAccountsPage() {
  return (
    <Suspense fallback={<div className="animate-fade-in">Loading...</div>}>
      <MailAccountsPageContent />
    </Suspense>
  )
}
