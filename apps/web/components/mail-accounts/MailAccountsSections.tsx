'use client'

import { useState } from 'react'
import { GmailOAuthButton } from '@/components/mail-accounts/GmailOAuthButton'
import { ZohoOAuthButton } from '@/components/mail-accounts/ZohoOAuthButton'
import {
  AccountHeader,
  ActionGrid,
  MetricPair,
  panelStyle,
  ProgressBar,
  StatCard,
  surfaceCardStyle,
} from '@/components/mail-accounts/MailAccountsPrimitives'
import { ZohoAccountForm } from '@/components/mail-accounts/ZohoAccountForm'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type {
  ActiveTab,
  DomainDiagnostics,
  DomainHealthSnapshot,
  DomainHealthSummary,
  MailAccount,
  MailboxMessage,
  WarmupLog,
  WarmupOverview,
  WarmupRecipient,
  WhatsAppAccount,
} from '@/components/mail-accounts/types'

export function MailAccountsHero(props: {
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void
  accountCount: number
  warmedCount: number
  whatsappCount: number
  connectedWhatsappCount: number
}) {
  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'accounts', label: 'Accounts' },
    { key: 'add-zoho', label: 'Add Zoho' },
    { key: 'add-gmail', label: 'Add Gmail' },
    { key: 'add-whatsapp', label: 'Add WhatsApp' },
  ]

  return (
    <>
      <div
        style={{
          ...panelStyle,
          marginBottom: '20px',
          background:
            'radial-gradient(circle at top left, rgba(214,170,102,0.2), transparent 34%), radial-gradient(circle at top right, rgba(31,37,45,0.08), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.96), rgba(251,248,242,0.92))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: '780px' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>
              Mail operations
            </div>
            <h1 style={{ fontSize: '34px', lineHeight: 1.1, fontWeight: 800, marginTop: '10px', color: 'var(--text-primary)' }}>
              Sender inventory and connection health, without the warmup clutter.
            </h1>
            <p style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              This page now stays focused on connected mailboxes, WhatsApp channels, and operational fixes.
              Warmup pacing, recipient pools, and stage tuning have moved into their own dedicated workspace.
            </p>
          </div>
          <div
            style={{
              minWidth: '260px',
              alignSelf: 'stretch',
              padding: '16px',
              borderRadius: '18px',
              border: '1px solid rgba(60, 45, 25, 0.08)',
              background: 'rgba(255,255,255,0.72)',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Operational focus
            </div>
            <div style={{ marginTop: '12px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
              Keep sender connections clean.
            </div>
            <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Repair OAuth, sync inboxes, and manage active senders here. Domain diagnostics and warmup controls now live outside this surface.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '12px', marginBottom: '20px' }}>
        <StatCard value={props.accountCount} label="Mail accounts" color="var(--text-primary)" />
        <StatCard value={props.warmedCount} label="Warmed mailboxes" color="var(--success)" />
        <StatCard value={props.whatsappCount} label="WhatsApp accounts" color="#22c55e" />
        <StatCard value={props.connectedWhatsappCount} label="Connected WhatsApp" color="#86efac" />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => props.setActiveTab(tab.key)}
            className={props.activeTab === tab.key ? 'btn-primary' : 'btn-ghost'}
            style={props.activeTab === tab.key ? { boxShadow: '0 10px 24px rgba(99,102,241,0.28)' } : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </>
  )
}

export function DomainPanels(props: {
  domainHealth: DomainHealthSummary[]
  domainHealthHistory: DomainHealthSnapshot[]
  domainDiagnostics: DomainDiagnostics[]
}) {
  return (
    <div style={{ display: 'grid', gap: '18px', marginBottom: '20px' }}>
      {props.domainHealth.length > 0 ? (
        <div style={panelStyle}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Domain health</div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {props.domainHealth.map((item) => (
              <div key={`${item.domain}-${item.providerHint}`} style={{ ...surfaceCardStyle, padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {item.domain} ({item.providerHint})
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                      Score {item.averageHealthScore}/100, {item.mailboxCount} mailboxes, {item.activeCampaignCount} active campaigns
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Healthy {item.healthyCount} | Warming {item.warmingCount} | At risk {item.atRiskCount} | Paused {item.pausedCount}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      7d sent {item.sentCount7d} | Bounce {(item.bounceRate7d * 100).toFixed(0)}% | Failure {(item.failureRate7d * 100).toFixed(0)}% | Complaints {item.complaintCount14d}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: item.healthStatus === 'healthy' ? 'var(--success)' : item.healthStatus === 'warming' ? 'var(--warning)' : 'var(--error)' }}>
                    {item.healthStatus.toUpperCase()}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>{item.notes}</div>
              </div>
            ))}
          </div>
          {props.domainHealthHistory.length > 0 ? (
            <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Recent snapshots: {props.domainHealthHistory.slice(0, 4).map((snapshot) => `${snapshot.domain} ${new Date(snapshot.periodEnd).toLocaleDateString()}`).join(' • ')}
            </div>
          ) : null}
        </div>
      ) : null}

      {props.domainDiagnostics.length > 0 ? (
        <div style={panelStyle}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Domain safety checks</div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {props.domainDiagnostics.map((item) => (
              <div key={`${item.domain}-${item.providerHint}`} style={{ ...surfaceCardStyle, padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {item.domain} ({item.providerHint})
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                      SPF {item.spf.providerAligned ? 'OK' : 'WARN'} | DKIM {item.dkim.providerAligned ? 'OK' : 'WARN'} | DMARC {item.dmarc.found ? (item.dmarc.policy || 'present') : 'missing'} | Score {item.riskScore}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{item.recommendedAction}</div>
                    {item.warnings.length > 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--error)', marginTop: '6px' }}>{item.warnings.join(' | ')}</div>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--success)', marginTop: '6px' }}>Provider alignment looks good.</div>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: item.severity === 'critical' ? 'var(--error)' : item.severity === 'warning' ? 'var(--warning)' : 'var(--success)' }}>
                    {item.severity.toUpperCase()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function AccountsView(props: {
  loading: boolean
  accounts: MailAccount[]
  whatsappAccounts: WhatsAppAccount[]
  pendingDailyLimits: Record<string, string>
  setPendingDailyLimits: React.Dispatch<React.SetStateAction<Record<string, string>>>
  handleWarmupStatusChange: (id: string, status: MailAccount['warmupStatus']) => void
  handleWarmupAutoToggle: (id: string, current: boolean) => void
  handleUpdateMailDailyLimit: (id: string) => void
  handleReconnectGmail: () => void
  handleReconnectZohoApi: () => void
  handleUseZohoApi: (id: string) => void
  handleZohoImapToggle: (id: string, current: boolean) => void
  handleOpenMailboxFolder: (mailAccountId: string, folderKind: 'INBOX' | 'SPAM' | 'SENT') => void
  handleMailboxAction: (
    mailAccountId: string,
    mailboxMessageId: string,
    action: 'mark-read' | 'rescue-to-inbox' | 'reply'
  ) => void
  activeMailboxAccountId: string | null
  activeMailboxFolder: 'INBOX' | 'SPAM' | 'SENT'
  mailboxMessages: MailboxMessage[]
  mailboxLoading: boolean
  handleRunWarmupNow: (id: string) => void
  handleRunMailboxSyncNow: (id: string) => void
  handleToggleMailActive: (id: string, current: boolean, warmupStatus: MailAccount['warmupStatus']) => void
  handleDeleteMail: (id: string, email: string) => void
  handleToggleWhatsappActive: (id: string, current: boolean) => void
  handleUpdateWhatsappLimit: (id: string, dailyLimit: number) => void
  handleReconnectWhatsapp: (id: string) => void
  handleDeleteWhatsapp: (id: string, name: string) => void
}) {
  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={panelStyle}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px' }}>Email accounts</div>
        {props.loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
        ) : props.accounts.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No email account connected.</div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {props.accounts.map((account) => (
              <div key={account.id} style={{ ...surfaceCardStyle, padding: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(320px,1fr)', gap: '18px' }}>
                  <div>
                    <AccountHeader
                      title={account.email}
                      providerLabel={account.type}
                      statusLabel={`${account.warmupStatus} • Stage ${account.warmupStage + 1}`}
                      secondaryStatus={account.type === 'zoho' && account.connectionReady === false ? 'Setup incomplete' : account.isActive ? 'Campaign active' : 'Campaign inactive'}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '10px', marginTop: '14px' }}>
                      <MetricPair label="Warmup 7d" value={`${account.warmupStats7d.successRate}% (${account.warmupStats7d.sent}/${account.warmupStats7d.total})`} />
                      <MetricPair label="Daily pacing" value={`${account.sentToday}/${account.dailyLimit} with target ${account.recommendedDailyLimit}`} />
                      <MetricPair label="Mailbox sync" value={<span><StatusBadge status={account.mailboxSyncStatus} /></span>} />
                      <MetricPair label="Mailbox health" value={`${account.mailboxHealthScore}/100 (${account.mailboxHealthStatus})`} tone={account.mailboxHealthScore > 65 ? 'var(--success)' : account.mailboxHealthScore > 0 ? 'var(--warning)' : 'var(--text-primary)'} />
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '12px', lineHeight: 1.7 }}>
                      Last mail: {account.lastMailSentAt ? new Date(account.lastMailSentAt).toLocaleString() : 'Never'}<br />
                      Last sync: {account.mailboxLastSyncedAt ? new Date(account.mailboxLastSyncedAt).toLocaleString() : 'Never'}<br />
                      Started: {account.warmupStartedAt ? new Date(account.warmupStartedAt).toLocaleString() : 'Not started'} | Completed: {account.warmupCompletedAt ? new Date(account.warmupCompletedAt).toLocaleString() : 'Not completed'}
                    </div>
                    {account.type === 'zoho' ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                        Zoho setup: {account.zohoSetupStatus === 'complete' ? 'SMTP + OAuth connected' : account.zohoSetupStatus === 'pending_oauth' ? 'SMTP connected, OAuth pending' : account.zohoSetupStatus === 'pending_smtp' ? 'OAuth connected, SMTP pending' : 'SMTP + OAuth pending'}
                        {' | '}Active inbox mode: {account.mailboxConnectionMethod === 'api' ? 'Zoho API' : 'Zoho IMAP'}
                        {account.mailboxConnectionMethod === 'imap' ? ` | IMAP ${account.zohoImapEnabled === false ? 'OFF' : 'ON'}` : ''}
                      </div>
                    ) : null}
                    {account.type === 'zoho' && account.connectionReady === false ? (
                      <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.22)', background: 'rgba(245,158,11,0.08)', color: 'var(--warning)', fontSize: '12px' }}>
                        This mailbox is kept in one matched record, but campaign activation should wait until SMTP and OAuth are both attached to the same Zoho email.
                      </div>
                    ) : null}
                    {account.mailboxSyncError ? (
                      <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.18)', background: 'rgba(239,68,68,0.08)', color: 'var(--error)', fontSize: '12px' }}>
                        Sync error: {account.mailboxSyncError}
                      </div>
                    ) : null}
                    {account.warmupHealthSnapshots[0]?.notes ? (
                      <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {account.warmupHealthSnapshots[0].notes}
                      </div>
                    ) : null}
                    <ProgressBar
                      value={account.sentToday}
                      max={Math.max(account.recommendedDailyLimit, account.dailyLimit)}
                      color={account.warmupStatus === 'WARMED' ? 'var(--success)' : 'var(--accent)'}
                    />
                  </div>
                  <div style={{ display: 'grid', gap: '10px', alignContent: 'start' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: '8px' }}>
                      <input
                        className="input-base"
                        type="number"
                        min={1}
                        max={500}
                        value={props.pendingDailyLimits[account.id] ?? String(account.dailyLimit)}
                        onChange={(e) => props.setPendingDailyLimits((prev) => ({ ...prev, [account.id]: e.target.value }))}
                      />
                      <button className="btn-ghost" onClick={() => props.handleUpdateMailDailyLimit(account.id)}>Save limit</button>
                    </div>
                    <select className="input-base" value={account.warmupStatus} onChange={(e) => props.handleWarmupStatusChange(account.id, e.target.value as MailAccount['warmupStatus'])}>
                      <option value="COLD">COLD</option>
                      <option value="WARMING">WARMING</option>
                      <option value="PAUSED">PAUSED</option>
                      <option value="WARMED">WARMED</option>
                    </select>
                    <ActionGrid>
                      <button className="btn-ghost" onClick={() => props.handleWarmupAutoToggle(account.id, account.warmupAutoEnabled)}>Auto {account.warmupAutoEnabled ? 'ON' : 'OFF'}</button>
                      {account.type === 'gmail' ? (
                        <button className="btn-ghost" onClick={props.handleReconnectGmail}>Reconnect Gmail</button>
                      ) : (
                        <>
                          {!account.zohoApiConnected ? (
                            <button className="btn-ghost" onClick={props.handleReconnectZohoApi}>Connect Zoho API</button>
                          ) : account.mailboxConnectionMethod === 'api' ? (
                            <button className="btn-ghost" onClick={props.handleReconnectZohoApi}>Reconnect Zoho API</button>
                          ) : (
                            <button className="btn-ghost" onClick={() => props.handleUseZohoApi(account.id)}>Use Zoho API</button>
                          )}
                          {account.mailboxConnectionMethod === 'imap' ? (
                            <button className="btn-ghost" onClick={() => props.handleZohoImapToggle(account.id, account.zohoImapEnabled !== false)}>
                              IMAP {account.zohoImapEnabled === false ? 'OFF' : 'ON'}
                            </button>
                          ) : null}
                        </>
                      )}
                      <button className="btn-ghost" onClick={() => props.handleOpenMailboxFolder(account.id, 'INBOX')} disabled={!account.mailboxSyncAvailable}>Open inbox</button>
                      <button className="btn-ghost" onClick={() => props.handleOpenMailboxFolder(account.id, 'SPAM')} disabled={!account.mailboxSyncAvailable}>Open spam</button>
                      <button className="btn-ghost" onClick={() => props.handleOpenMailboxFolder(account.id, 'SENT')} disabled={!account.mailboxSyncAvailable}>Open sent</button>
                      <button className="btn-ghost" onClick={() => props.handleRunWarmupNow(account.id)} disabled={account.warmupStatus !== 'WARMING' || !account.warmupAutoEnabled}>Run warmup</button>
                      <button className="btn-ghost" onClick={() => props.handleRunMailboxSyncNow(account.id)} disabled={!account.mailboxSyncAvailable}>Sync mailbox</button>
                      <button className="btn-ghost" onClick={() => props.handleToggleMailActive(account.id, account.isActive, account.warmupStatus)}>
                        {account.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => props.handleDeleteMail(account.id, account.email)}>Remove</button>
                    </ActionGrid>
                  </div>
                </div>
                {props.activeMailboxAccountId === account.id ? (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {props.activeMailboxFolder === 'SPAM' ? 'Spam folder' : props.activeMailboxFolder === 'SENT' ? 'Sent folder' : 'Inbox'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {props.mailboxLoading ? 'Loading messages...' : `${props.mailboxMessages.length} recent messages`}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {props.mailboxMessages.length === 0 && !props.mailboxLoading ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No synced messages in this folder yet.</div>
                      ) : null}
                      {props.mailboxMessages.map((message) => (
                        <div key={message.id} style={{ ...surfaceCardStyle, padding: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {message.subject || '(no subject)'}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                From {message.fromEmail || 'Unknown'} | To {message.toEmail || 'Unknown'}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {message.receivedAt || message.sentAt ? new Date(message.receivedAt || message.sentAt || '').toLocaleString() : 'No timestamp'}
                              </div>
                              {message.snippet ? (
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>{message.snippet}</div>
                              ) : null}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignContent: 'start', justifyContent: 'flex-end' }}>
                              {!message.isRead ? (
                                <button className="btn-ghost" onClick={() => props.handleMailboxAction(account.id, message.id, 'mark-read')}>Mark read</button>
                              ) : null}
                              {message.isSpam ? (
                                <button className="btn-ghost" onClick={() => props.handleMailboxAction(account.id, message.id, 'rescue-to-inbox')}>Move to inbox</button>
                              ) : null}
                              {message.direction === 'inbound' ? (
                                <button className="btn-ghost" onClick={() => props.handleMailboxAction(account.id, message.id, 'reply')}>Reply</button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={panelStyle}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px' }}>WhatsApp accounts</div>
        {props.loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
        ) : props.whatsappAccounts.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No WhatsApp account connected.</div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {props.whatsappAccounts.map((wa) => (
              <div key={wa.id} style={{ ...surfaceCardStyle, padding: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(280px,360px)', gap: '18px' }}>
                  <div>
                    <AccountHeader
                      title={wa.displayName}
                      providerLabel="active"
                      statusLabel={wa.connectionStatus}
                      secondaryStatus={wa.phoneNumber || 'No phone number saved'}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(160px,1fr))', gap: '10px', marginTop: '14px' }}>
                      <MetricPair label="Daily send" value={`${wa.sentToday}/${wa.dailyLimit}`} />
                      <MetricPair label="Total sent" value={wa._count.sentMessages} />
                    </div>
                    {wa.lastError ? <div style={{ fontSize: '12px', color: 'var(--error)', marginTop: '10px' }}>{wa.lastError}</div> : null}
                    {wa.lastQr ? (
                      <div style={{ marginTop: '12px', padding: '12px', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>QR pending for pairing</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Open WhatsApp on your phone, go to Linked Devices, and scan the QR from the live session view.
                        </div>
                      </div>
                    ) : null}
                    <ProgressBar value={wa.sentToday} max={wa.dailyLimit} color="#22c55e" />
                  </div>
                  <div style={{ display: 'grid', gap: '8px', alignContent: 'start' }}>
                    <input className="input-base" type="number" min={1} max={500} value={wa.dailyLimit} onChange={(e) => props.handleUpdateWhatsappLimit(wa.id, Math.max(1, Number(e.target.value || 1)))} />
                    <ActionGrid>
                      <button className="btn-ghost" onClick={() => props.handleToggleWhatsappActive(wa.id, wa.isActive)}>{wa.isActive ? 'Disable' : 'Enable'}</button>
                      <button className="btn-ghost" onClick={() => props.handleReconnectWhatsapp(wa.id)}>Reconnect</button>
                      <button className="btn-ghost" style={{ color: 'var(--error)', gridColumn: '1 / -1' }} onClick={() => props.handleDeleteWhatsapp(wa.id, wa.displayName)}>Remove</button>
                    </ActionGrid>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function WarmupView(props: {
  warmupOverview: WarmupOverview | null
  loading: boolean
  warmupRecipients: WarmupRecipient[]
  recipientForm: { email: string; name: string; isActive: boolean }
  setRecipientForm: React.Dispatch<React.SetStateAction<{ email: string; name: string; isActive: boolean }>>
  recipientSaving: boolean
  bulkRecipients: string
  setBulkRecipients: React.Dispatch<React.SetStateAction<string>>
  handleCreateWarmupRecipient: () => void
  handleBulkWarmupRecipients: () => void
  handleToggleWarmupRecipient: (id: string, current: boolean) => void
  handleDeleteWarmupRecipient: (id: string, email: string) => void
  warmupLogs: WarmupLog[]
  recipientPoolHealthy: boolean
  activeMailboxPool: number
  activeCustomRecipients: number
}) {
  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={panelStyle}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>Warmup control panel</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '12px' }}>
          <StatCard value={props.warmupOverview?.warming ?? 0} label="Warming senders" color="var(--accent)" />
          <StatCard value={props.warmupOverview?.warmed ?? 0} label="Warmed senders" color="var(--success)" />
          <StatCard value={props.activeMailboxPool} label="Active mailbox pool" color="var(--text-primary)" />
          <StatCard value={props.activeCustomRecipients} label="Active custom recipients" color="var(--warning)" />
        </div>
        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Recipient pool is currently {props.recipientPoolHealthy ? 'healthy' : 'thin'}.
        </div>
      </div>

      <div style={panelStyle}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Warmup recipients</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '10px', marginBottom: '12px' }}>
          <input className="input-base" type="email" placeholder="recipient@example.com" value={props.recipientForm.email} onChange={(e) => props.setRecipientForm((prev) => ({ ...prev, email: e.target.value }))} />
          <input className="input-base" type="text" placeholder="Display name" value={props.recipientForm.name} onChange={(e) => props.setRecipientForm((prev) => ({ ...prev, name: e.target.value }))} />
          <button className="btn-primary" disabled={props.recipientSaving} onClick={props.handleCreateWarmupRecipient}>{props.recipientSaving ? 'Saving...' : 'Add recipient'}</button>
        </div>
        <textarea className="input-base" placeholder="Paste emails separated by commas, spaces, or new lines" value={props.bulkRecipients} onChange={(e) => props.setBulkRecipients(e.target.value)} style={{ minHeight: '110px', resize: 'vertical' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
          <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={props.recipientForm.isActive} onChange={(e) => props.setRecipientForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
            Start active
          </label>
          <button className="btn-ghost" disabled={props.recipientSaving} onClick={props.handleBulkWarmupRecipients}>{props.recipientSaving ? 'Importing...' : 'Import bulk recipients'}</button>
        </div>

        <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
          {props.loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading recipients...</div>
          ) : props.warmupRecipients.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No warmup recipients yet.</div>
          ) : (
            props.warmupRecipients.map((recipient) => (
              <div key={recipient.id} style={{ ...surfaceCardStyle, padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{recipient.name || recipient.email}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{recipient.email}</div>
                    <div style={{ fontSize: '12px', color: recipient.isActive ? 'var(--success)' : 'var(--warning)', marginTop: '4px' }}>
                      {recipient.isSystem ? 'System recipient' : 'Custom recipient'} • {recipient.isActive ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn-ghost" disabled={recipient.isSystem} onClick={() => props.handleToggleWarmupRecipient(recipient.id, recipient.isActive)}>
                      {recipient.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn-ghost" style={{ color: 'var(--error)' }} disabled={recipient.isSystem} onClick={() => props.handleDeleteWarmupRecipient(recipient.id, recipient.email)}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={panelStyle}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Recent warmup mail</div>
        {props.warmupLogs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No warmup mail logged yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {props.warmupLogs.map((log) => (
              <div key={log.id} style={{ ...surfaceCardStyle, padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {log.direction === 'reply' ? 'Reply' : 'Outbound'} • {log.status.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      From {log.senderMailAccount.displayName} to {log.recipientMailAccount?.displayName || log.recipientEmail}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Stage {log.stage} • {new Date(log.sentAt).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '6px' }}>{log.subject}</div>
                    {log.errorMessage ? <div style={{ fontSize: '12px', color: 'var(--error)', marginTop: '6px' }}>{log.errorMessage}</div> : null}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: log.status === 'sent' ? 'var(--success)' : 'var(--warning)' }}>
                    {log.recipientType === 'system' ? 'System' : 'External'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ZohoDualSetupPanel({ onBothConnected }: { onBothConnected: () => void }) {
  const [smtpDone, setSmtpDone] = useState(false)
  const [oauthDone, setOauthDone] = useState(false)
  const bothDone = smtpDone && oauthDone

  const stepPanelStyle = (done: boolean): React.CSSProperties => ({
    ...panelStyle,
    border: done
      ? '1.5px solid rgba(34,211,165,0.35)'
      : '1px solid rgba(255,255,255,0.08)',
    position: 'relative',
    transition: 'border-color 0.25s',
  })

  const badgeStyle: React.CSSProperties = {
    position: 'absolute',
    top: '14px',
    right: '14px',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
  }

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      {/* Step 1 — SMTP */}
      <div style={stepPanelStyle(smtpDone)}>
        {smtpDone ? (
          <div style={{ ...badgeStyle, background: 'rgba(34,211,165,0.14)', color: 'var(--success)' }}>
            ✓ Connected
          </div>
        ) : (
          <div style={{ ...badgeStyle, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
            Step 1
          </div>
        )}
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>SMTP — outbound sending</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
          Required for campaigns. Connects the Zoho mailbox as a sending account.
        </div>
        {smtpDone ? (
          <div style={{ fontSize: '13px', color: 'var(--success)' }}>SMTP credentials saved successfully.</div>
        ) : (
          <ZohoAccountForm
            onAccountAdded={() => setSmtpDone(true)}
          />
        )}
      </div>

      {/* Step 2 — OAuth */}
      <div style={stepPanelStyle(oauthDone)}>
        {oauthDone ? (
          <div style={{ ...badgeStyle, background: 'rgba(34,211,165,0.14)', color: 'var(--success)' }}>
            ✓ Connected
          </div>
        ) : (
          <div style={{ ...badgeStyle, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
            Step 2
          </div>
        )}
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Zoho OAuth — inbox sync & tools</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
          Unlocks inbox sync, spam rescue, and reply actions. Use the same email address as SMTP above — the app upgrades that same mailbox record automatically.
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            padding: '16px',
            border: '2px dashed rgba(255,255,255,0.1)',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(37,99,235,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#93c5fd',
              fontWeight: 800,
              fontSize: '20px',
              flexShrink: 0,
            }}
          >
            Z
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Connect Zoho OAuth</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              You will be redirected to Zoho to authorize access. When done, come back and this panel will update.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
            <button
              className="btn-primary"
              onClick={() => { window.location.href = '/api/mail-accounts/zoho/connect' }}
            >
              Connect via OAuth
            </button>
            {!oauthDone && (
              <button
                className="btn-ghost"
                style={{ fontSize: '11px' }}
                onClick={() => setOauthDone(true)}
              >
                I already connected OAuth ✓
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Save button — only when both done */}
      {bothDone ? (
        <div
          style={{
            ...panelStyle,
            background: 'rgba(34,211,165,0.06)',
            border: '1.5px solid rgba(34,211,165,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--success)' }}>✓ Both connections ready</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              SMTP and OAuth are both attached. Click Save to finish and load the account into the dashboard.
            </div>
          </div>
          <button
            className="btn-primary"
            style={{ background: 'rgba(34,211,165,0.9)', color: '#000', minWidth: '160px' }}
            onClick={onBothConnected}
          >
            Save &amp; Connect Zoho Account
          </button>
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0' }}>
          Complete both steps above to enable the Save button.
        </div>
      )}
    </div>
  )
}

export function AddZohoView({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div style={{ display: 'grid', gap: '18px' }}>
        <div style={{ ...panelStyle, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          Zoho mailboxes are tracked as one shared account record.
          Use the button below to open the setup modal, connect both SMTP and OAuth for the same email address, and save.
          The dashboard will only treat the mailbox as fully ready after both SMTP and OAuth are linked.
        </div>
        <div style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>Connect new Zoho mail account</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.7 }}>
                First attach SMTP for sending or OAuth for inbox tools.
                Then complete the missing side using the same email address so the database keeps one matched mailbox record.
              </div>
            </div>
            <button className="btn-primary" onClick={() => setOpen(true)}>
              Connect new Zoho account
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(4,6,12,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              width: 'min(980px, 100%)',
              maxHeight: 'calc(100vh - 48px)',
              overflowY: 'auto',
              borderRadius: '24px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'linear-gradient(180deg, rgba(16,16,24,0.98), rgba(10,10,16,0.98))',
              boxShadow: '0 26px 80px rgba(0,0,0,0.4)',
              padding: '22px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>New Zoho mailbox setup</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.7, maxWidth: '760px' }}>
                  Connect <strong>both SMTP and OAuth</strong> for the same Zoho email address below.
                  Each step can be done in any order. The <strong>Save button</strong> appears only after both are connected.
                </div>
              </div>
              <button className="btn-ghost" onClick={() => setOpen(false)}>Close</button>
            </div>

            <ZohoDualSetupPanel
              onBothConnected={() => {
                onAdded()
                setOpen(false)
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

export function AddGmailView() {
  return <div style={panelStyle}><GmailOAuthButton /></div>
}

export function AddWhatsappView(props: {
  waForm: { displayName: string; phoneNumber: string; dailyLimit: number }
  setWaForm: React.Dispatch<React.SetStateAction<{ displayName: string; phoneNumber: string; dailyLimit: number }>>
  waSaving: boolean
  handleCreateWhatsapp: () => void
}) {
  return (
    <div style={{ ...panelStyle, maxWidth: '680px' }}>
      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>Connect WhatsApp</div>
      <div style={{ display: 'grid', gap: '10px' }}>
        <input className="input-base" type="text" placeholder="Display name" value={props.waForm.displayName} onChange={(e) => props.setWaForm((prev) => ({ ...prev, displayName: e.target.value }))} />
        <input className="input-base" type="text" placeholder="Phone number (optional)" value={props.waForm.phoneNumber} onChange={(e) => props.setWaForm((prev) => ({ ...prev, phoneNumber: e.target.value }))} />
        <input className="input-base" type="number" min={1} max={500} value={props.waForm.dailyLimit} onChange={(e) => props.setWaForm((prev) => ({ ...prev, dailyLimit: Math.max(1, Number(e.target.value || 1)) }))} />
        <button className="btn-primary" disabled={props.waSaving || !props.waForm.displayName.trim()} onClick={props.handleCreateWhatsapp}>
          {props.waSaving ? 'Adding...' : 'Add WhatsApp account'}
        </button>
      </div>
    </div>
  )
}
