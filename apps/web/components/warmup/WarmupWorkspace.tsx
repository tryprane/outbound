'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Flame, RefreshCw, Save, Users } from 'lucide-react'
import { useMailAccountsDashboard } from '@/components/mail-accounts/useMailAccountsDashboard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'

interface WarmupSettingsResponse {
  globalEnabled: boolean
  stageCounts: number[]
}

const FALLBACK_STAGE_COUNTS = [5, 8, 12, 18, 25, 35, 50, 65, 80, 100]

export function WarmupWorkspace() {
  const dashboard = useMailAccountsDashboard()
  const [settings, setSettings] = useState<WarmupSettingsResponse>({
    globalEnabled: true,
    stageCounts: FALLBACK_STAGE_COUNTS,
  })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let isMounted = true

    const loadSettings = async () => {
      try {
        const response = await fetch('/api/warmup-settings')
        const data = (await response.json()) as WarmupSettingsResponse
        if (isMounted) {
          setSettings({
            globalEnabled: data.globalEnabled,
            stageCounts: data.stageCounts?.length ? data.stageCounts : FALLBACK_STAGE_COUNTS,
          })
        }
      } catch {
        if (isMounted) {
          setMessage({ type: 'error', text: 'Unable to load warmup settings right now.' })
        }
      }
    }

    void loadSettings()
    return () => {
      isMounted = false
    }
  }, [])

  const healthPercentages = useMemo(() => {
    const total = Math.max(1, dashboard.warmupOverview?.total ?? 0)
    const warming = Math.round(((dashboard.warmupOverview?.warming ?? 0) / total) * 100)
    const warmed = Math.round(((dashboard.warmupOverview?.warmed ?? 0) / total) * 100)
    const pool = Math.min(
      100,
      Math.round(
        ((dashboard.activeCustomRecipients + dashboard.activeMailboxPool) /
          Math.max(1, dashboard.accounts.length + dashboard.warmupRecipients.length)) *
          100
      )
    )

    return { warming, warmed, pool }
  }, [
    dashboard.accounts.length,
    dashboard.activeCustomRecipients,
    dashboard.activeMailboxPool,
    dashboard.warmupOverview?.total,
    dashboard.warmupOverview?.warming,
    dashboard.warmupOverview?.warmed,
    dashboard.warmupRecipients.length,
  ])

  const saveSettings = () => {
    setMessage(null)
    startTransition(async () => {
      try {
        const response = await fetch('/api/warmup-settings', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(settings),
        })

        if (!response.ok) {
          throw new Error('Failed to save')
        }

        const data = (await response.json()) as WarmupSettingsResponse
        setSettings(data)
        setMessage({ type: 'success', text: 'Warmup settings saved.' })
      } catch {
        setMessage({ type: 'error', text: 'Unable to save warmup settings.' })
      }
    })
  }

  return (
    <div className="animate-fade-in space-y-6">
      <section className="page-shell overflow-hidden rounded-[34px] border border-white/70 px-8 py-8 shadow-[0_28px_80px_rgba(60,45,25,0.08)]">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <Badge variant="outline" className="bg-white/75">
              Email warmup
            </Badge>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[var(--text-primary)] md:text-5xl">
                Stage pacing, recipient health, and logs in one warmup lane.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
                This workspace is purpose-built for sender ramp-up. Adjust the global switch, tune daily stage counts,
                and manage the recipient pool without mixing those controls into the account inventory page.
              </p>
            </div>
          </div>

          <Card className="rounded-[30px] border-black/8 bg-[linear-gradient(180deg,#232a33,#2f3844)] text-white shadow-none">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-white/10">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm uppercase tracking-[0.22em] text-white/55">Warmup control</div>
                  <div className="mt-1 text-xl font-medium">
                    {settings.globalEnabled ? 'Warmup processing is live' : 'Warmup processing is paused'}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/68">
                Disabling the global switch prevents the worker from picking up new warmup jobs while keeping account data intact.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {message ? (
        <div
          className={`rounded-[24px] border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[30px] border-black/8 bg-white/90 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-8 pb-4">
            <div>
              <CardTitle className="text-2xl tracking-[-0.03em]">Global warmup controls</CardTitle>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Pause or resume warmup processing and save live stage pacing values for the worker.
              </p>
            </div>
            <Switch
              checked={settings.globalEnabled}
              onCheckedChange={(checked) =>
                setSettings((current) => ({ ...current, globalEnabled: checked }))
              }
            />
          </CardHeader>
          <CardContent className="space-y-6 p-8 pt-2">
            <div className="table-shell">
              <table className="w-full border-collapse text-left">
                <thead className="bg-[#faf6ef] text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-4 font-medium">Stage</th>
                    <th className="px-4 py-4 font-medium">Daily emails</th>
                    <th className="px-4 py-4 font-medium">Ramp note</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.stageCounts.map((count, index) => (
                    <tr key={`stage-${index}`} className="border-t border-black/6">
                      <td className="px-4 py-4 text-sm font-medium text-[var(--text-primary)]">
                        Stage {index + 1}
                        {index === settings.stageCounts.length - 1 ? '+' : ''}
                      </td>
                      <td className="px-4 py-4">
                        <Input
                          type="number"
                          min={1}
                          className="max-w-[140px] rounded-2xl border-black/10 bg-[#fcfbf8]"
                          value={count}
                          onChange={(event) => {
                            const next = [...settings.stageCounts]
                            next[index] = Math.max(1, Number(event.target.value || 1))
                            setSettings((current) => ({ ...current, stageCounts: next }))
                          }}
                        />
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--text-secondary)]">
                        {index < 3
                          ? 'Protect reputation while the mailbox is fresh.'
                          : index < 7
                            ? 'Increase sending gradually as engagement stabilizes.'
                            : 'Reserved for mature warmup behavior and high-confidence senders.'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button className="rounded-full px-6" onClick={saveSettings} disabled={isPending}>
                {isPending ? 'Saving...' : 'Save warmup settings'}
                <Save className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-black/10 bg-white"
                onClick={() =>
                  setSettings({
                    globalEnabled: true,
                    stageCounts: FALLBACK_STAGE_COUNTS,
                  })
                }
              >
                Reset defaults
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="rounded-[30px] border-black/8 bg-white/90 shadow-none">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-2xl tracking-[-0.03em]">Warmup statistics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 p-8 pt-2">
              {[
                ['Warming mailboxes', dashboard.warmupOverview?.warming ?? 0, healthPercentages.warming],
                ['Warmed mailboxes', dashboard.warmupOverview?.warmed ?? 0, healthPercentages.warmed],
                ['Pool health', dashboard.recipientPoolHealthy ? 'Healthy' : 'Thin', healthPercentages.pool],
              ].map(([label, value, progress]) => (
                <div key={label} className="rounded-[24px] border border-black/8 bg-[#fcfbf8] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
                    <div className="text-sm text-[var(--text-secondary)]">{value}</div>
                  </div>
                  <Progress className="mt-4 bg-black/6" value={Number(progress)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[30px] border-black/8 bg-white/90 shadow-none">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-2xl tracking-[-0.03em]">Recipient pool snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 p-8 pt-2 sm:grid-cols-2">
              <div className="rounded-[24px] border border-black/8 bg-[#fcfbf8] p-5">
                <div className="text-sm uppercase tracking-[0.18em] text-[var(--text-muted)]">Active mailbox pool</div>
                <div className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                  {dashboard.activeMailboxPool}
                </div>
              </div>
              <div className="rounded-[24px] border border-black/8 bg-[#fcfbf8] p-5">
                <div className="text-sm uppercase tracking-[0.18em] text-[var(--text-muted)]">Custom recipients</div>
                <div className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                  {dashboard.activeCustomRecipients}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[30px] border-black/8 bg-white/90 shadow-none">
          <CardHeader className="p-8 pb-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-2xl tracking-[-0.03em]">Warmup recipients</CardTitle>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  Add individual recipients or import a bulk list for the warmup network.
                </p>
              </div>
              <Badge variant="outline">
                <Users className="h-3 w-3" />
                {dashboard.warmupRecipients.length} total
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-8 pt-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recipient-email">Recipient email</Label>
                <Input
                  id="recipient-email"
                  type="email"
                  className="rounded-2xl border-black/10 bg-[#fcfbf8]"
                  placeholder="recipient@example.com"
                  value={dashboard.recipientForm.email}
                  onChange={(event) =>
                    dashboard.setRecipientForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipient-name">Display name</Label>
                <Input
                  id="recipient-name"
                  className="rounded-2xl border-black/10 bg-[#fcfbf8]"
                  placeholder="Display name"
                  value={dashboard.recipientForm.name}
                  onChange={(event) =>
                    dashboard.setRecipientForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={dashboard.recipientForm.isActive}
                  onChange={(event) =>
                    dashboard.setRecipientForm((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                />
                Start active
              </label>
              <Button
                className="rounded-full px-6"
                onClick={dashboard.handleCreateWarmupRecipient}
                disabled={dashboard.recipientSaving}
              >
                {dashboard.recipientSaving ? 'Saving...' : 'Add recipient'}
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-recipients">Bulk import</Label>
              <textarea
                id="bulk-recipients"
                className="input-base min-h-[120px] resize-y rounded-[24px] border-black/10 bg-[#fcfbf8]"
                placeholder="Paste emails separated by commas, spaces, or new lines"
                value={dashboard.bulkRecipients}
                onChange={(event) => dashboard.setBulkRecipients(event.target.value)}
              />
            </div>

            <Button
              variant="outline"
              className="rounded-full border-black/10 bg-white"
              onClick={dashboard.handleBulkWarmupRecipients}
              disabled={dashboard.recipientSaving}
            >
              <RefreshCw className="h-4 w-4" />
              {dashboard.recipientSaving ? 'Importing...' : 'Import bulk recipients'}
            </Button>

            <div className="space-y-3">
              {dashboard.warmupRecipients.slice(0, 8).map((recipient) => (
                <div
                  key={recipient.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-black/8 bg-[#fcfbf8] p-4"
                >
                  <div>
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      {recipient.name || recipient.email}
                    </div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">{recipient.email}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={recipient.isActive ? 'success' : 'warning'}>
                      {recipient.isActive ? 'Active' : 'Paused'}
                    </Badge>
                    {!recipient.isSystem ? (
                      <>
                        <Button
                          variant="outline"
                          className="rounded-full border-black/10 bg-white"
                          onClick={() =>
                            dashboard.handleToggleWarmupRecipient(recipient.id, recipient.isActive)
                          }
                        >
                          {recipient.isActive ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-full border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          onClick={() =>
                            dashboard.handleDeleteWarmupRecipient(recipient.id, recipient.email)
                          }
                        >
                          Remove
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[30px] border-black/8 bg-white/90 shadow-none">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-2xl tracking-[-0.03em]">Recent warmup logs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-8 pt-2">
            {dashboard.warmupLogs.slice(0, 10).map((log) => (
              <div key={log.id} className="rounded-[24px] border border-black/8 bg-[#fcfbf8] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{log.subject}</div>
                  <Badge variant={log.status === 'sent' ? 'success' : 'warning'}>
                    {log.status}
                  </Badge>
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  From {log.senderMailAccount.displayName} to {log.recipientMailAccount?.displayName || log.recipientEmail}
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Stage {log.stage} • {new Date(log.sentAt).toLocaleString()}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
