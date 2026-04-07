'use client'

import { Suspense } from 'react'
import {
  AccountsView,
  AddGmailView,
  AddWhatsappView,
  AddZohoView,
  MailAccountsHero,
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
      />

      {dashboard.activeTab === 'accounts' ? (
        <AccountsView
          loading={dashboard.loading}
          accounts={dashboard.accounts}
          accountsPagination={dashboard.accountsPagination}
          setAccountsPage={dashboard.setAccountsPage}
          setAccountsLimit={dashboard.setAccountsLimit}
          whatsappAccounts={dashboard.whatsappAccounts}
          whatsappPagination={dashboard.whatsappPagination}
          setWhatsAppPage={dashboard.setWhatsAppPage}
          setWhatsAppLimit={dashboard.setWhatsAppLimit}
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
          mailboxPagination={dashboard.mailboxPagination}
          mailboxLoading={dashboard.mailboxLoading}
          handleMailboxPageChange={dashboard.handleMailboxPageChange}
          handleMailboxLimitChange={dashboard.handleMailboxLimitChange}
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
