'use client'

import { GmailOAuthButton } from '@/components/mail-accounts/GmailOAuthButton'
import { ZohoAccountForm } from '@/components/mail-accounts/ZohoAccountForm'
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

const panelStyle: React.CSSProperties = {
  padding: '18px',
  borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'linear-gradient(180deg, rgba(22,22,31,0.96), rgba(14,14,22,0.96))',
  boxShadow: '0 18px 45px rgba(0,0,0,0.25)',
}

const metricCardStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '16px',
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
}

function StatCard({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div style={metricCardStyle}>
      <div style={{ fontSize: '24px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>{label}</div>
    </div>
  )
}

export function MailAccountsHero(props: {
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void
  accountCount: number
  warmedCount: number
  whatsappCount: number
  connectedWhatsappCount: number
  activeRecipients: number
  criticalDomains: number
  riskyDomains: number
}) {
  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'accounts', label: 'Accounts' },
    { key: 'warmup', label: 'Warmup' },
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
            'radial-gradient(circle at top left, rgba(99,102,241,0.24), transparent 36%), radial-gradient(circle at top right, rgba(34,211,165,0.14), transparent 30%), linear-gradient(180deg, rgba(20,20,31,0.98), rgba(11,11,18,0.98))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: '780px' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>
              Build Web Apps
            </div>
            <h1 style={{ fontSize: '34px', lineHeight: 1.1, fontWeight: 800, marginTop: '10px', color: 'var(--text-primary)' }}>
              Mailbox operations, warmup, and deliverability in one workspace
            </h1>
            <p style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              The dashboard is now organized around operational status instead of dumping every control into one dense list.
              Review sender health, unblock sync issues, and act on warmup mailboxes without hunting through the page.
            </p>
          </div>
          <div
            style={{
              minWidth: '260px',
              alignSelf: 'stretch',
              padding: '16px',
              borderRadius: '18px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Operational focus
            </div>
            <div style={{ marginTop: '12px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
              Keep campaign senders clean.
            </div>
            <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Warmup sender health, sync recoverability, and domain safety are surfaced first so risky accounts stand out earlier.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '12px', marginBottom: '20px' }}>
        <StatCard value={props.accountCount} label="Mail accounts" color="var(--accent)" />
        <StatCard value={props.warmedCount} label="Warmed mailboxes" color="var(--success)" />
        <StatCard value={props.whatsappCount} label="WhatsApp accounts" color="#22c55e" />
        <StatCard value={props.connectedWhatsappCount} label="Connected WhatsApp" color="#86efac" />
        <StatCard value={props.activeRecipients} label="Active warmup recipients" color="var(--warning)" />
        <StatCard value={props.criticalDomains} label="Critical domain issues" color="var(--error)" />
        <StatCard value={props.riskyDomains} label="Domains at risk" color="var(--error)" />
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
              <div key={`${item.domain}-${item.providerHint}`} style={{ ...metricCardStyle, padding: '14px' }}>
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
              <div key={`${item.domain}-${item.providerHint}`} style={{ ...metricCardStyle, padding: '14px' }}>
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
  handleZohoImapToggle: (id: string, current: boolean) => void
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
              <div key={account.id} style={{ ...metricCardStyle, padding: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(320px,1fr)', gap: '18px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{account.email}</div>
                      <span className="badge badge-completed">{account.type.toUpperCase()}</span>
                      <span className="badge" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--text-primary)' }}>
                        {account.warmupStatus} • Stage {account.warmupStage + 1}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '10px', marginTop: '14px' }}>
                      <div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Warmup 7d</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{account.warmupStats7d.successRate}% ({account.warmupStats7d.sent}/{account.warmupStats7d.total})</div></div>
                      <div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Daily pacing</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{account.sentToday}/{account.dailyLimit} with target {account.recommendedDailyLimit}</div></div>
                      <div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Mailbox sync</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{account.mailboxSyncStatus.toUpperCase()}</div></div>
                      <div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Mailbox health</div><div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{account.mailboxHealthScore}/100 ({account.mailboxHealthStatus})</div></div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '12px', lineHeight: 1.7 }}>
                      Last mail: {account.lastMailSentAt ? new Date(account.lastMailSentAt).toLocaleString() : 'Never'}<br />
                      Last sync: {account.mailboxLastSyncedAt ? new Date(account.mailboxLastSyncedAt).toLocaleString() : 'Never'}<br />
                      Started: {account.warmupStartedAt ? new Date(account.warmupStartedAt).toLocaleString() : 'Not started'} | Completed: {account.warmupCompletedAt ? new Date(account.warmupCompletedAt).toLocaleString() : 'Not completed'}
                    </div>
                    {account.type === 'zoho' ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                        Zoho IMAP: {account.zohoImapEnabled === false ? 'OFF' : 'ON'}
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '8px' }}>
                      <button className="btn-ghost" onClick={() => props.handleWarmupAutoToggle(account.id, account.warmupAutoEnabled)}>Auto {account.warmupAutoEnabled ? 'ON' : 'OFF'}</button>
                      {account.type === 'gmail' ? (
                        <button className="btn-ghost" onClick={props.handleReconnectGmail}>Reconnect Gmail</button>
                      ) : (
                        <button className="btn-ghost" onClick={() => props.handleZohoImapToggle(account.id, account.zohoImapEnabled !== false)}>
                          IMAP {account.zohoImapEnabled === false ? 'OFF' : 'ON'}
                        </button>
                      )}
                      <button className="btn-ghost" onClick={() => props.handleRunWarmupNow(account.id)} disabled={account.warmupStatus !== 'WARMING' || !account.warmupAutoEnabled}>Run warmup</button>
                      <button className="btn-ghost" onClick={() => props.handleRunMailboxSyncNow(account.id)} disabled={account.type === 'zoho' && account.zohoImapEnabled === false}>Sync mailbox</button>
                      <button className="btn-ghost" onClick={() => props.handleToggleMailActive(account.id, account.isActive, account.warmupStatus)}>
                        {account.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => props.handleDeleteMail(account.id, account.email)}>Remove</button>
                    </div>
                  </div>
                </div>
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
              <div key={wa.id} style={{ ...metricCardStyle, padding: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(280px,360px)', gap: '18px' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{wa.displayName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                      {wa.phoneNumber || 'No phone number saved'} • {wa.connectionStatus}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                      Sent today {wa.sentToday}/{wa.dailyLimit} • Total sent {wa._count.sentMessages}
                    </div>
                    {wa.lastError ? <div style={{ fontSize: '12px', color: 'var(--error)', marginTop: '10px' }}>{wa.lastError}</div> : null}
                  </div>
                  <div style={{ display: 'grid', gap: '8px', alignContent: 'start' }}>
                    <input className="input-base" type="number" min={1} max={500} value={wa.dailyLimit} onChange={(e) => props.handleUpdateWhatsappLimit(wa.id, Math.max(1, Number(e.target.value || 1)))} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '8px' }}>
                      <button className="btn-ghost" onClick={() => props.handleToggleWhatsappActive(wa.id, wa.isActive)}>{wa.isActive ? 'Disable' : 'Enable'}</button>
                      <button className="btn-ghost" onClick={() => props.handleReconnectWhatsapp(wa.id)}>Reconnect</button>
                      <button className="btn-ghost" style={{ color: 'var(--error)', gridColumn: '1 / -1' }} onClick={() => props.handleDeleteWhatsapp(wa.id, wa.displayName)}>Remove</button>
                    </div>
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
              <div key={recipient.id} style={{ ...metricCardStyle, padding: '14px' }}>
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
              <div key={log.id} style={{ ...metricCardStyle, padding: '14px' }}>
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

export function AddZohoView({ onAdded }: { onAdded: () => void }) {
  return <div style={panelStyle}><ZohoAccountForm onAccountAdded={onAdded} /></div>
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
