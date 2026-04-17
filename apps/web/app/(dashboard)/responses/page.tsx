'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PaginationControls } from '@/components/ui/pagination-controls'

type MailAccountOption = {
  id: string
  email: string
  displayName: string
}

type ResponseReply = {
  id: string
  mailAccountId: string
  fromEmail: string | null
  toEmail: string | null
  subject: string | null
  snippet: string | null
  receivedAt: string | null
  openedAt: string | null
  analyzedAt: string | null
  analysisStatus: 'idle' | 'pending' | 'complete' | 'error'
  analysisModel: string | null
  analysisLabel: string | null
  analysisShouldReply: boolean | null
  analysisPriority: 'high' | 'medium' | 'low' | null
  analysisSummary: string | null
  analysisReason: string | null
  analysisError: string | null
  mailAccount: MailAccountOption
}

type Summary = {
  openedCount: number
  analyzedCount: number
  pendingCount: number
  shouldReplyCount: number
  highPriorityCount: number
  labelCounts: Record<string, number>
}

type Payload = {
  items: ResponseReply[]
  replies?: ResponseReply[]
  total: number
  page: number
  pages: number
  limit: number
  summary: Summary
  filters: {
    accounts: MailAccountOption[]
  }
}

const DEFAULT_SUMMARY: Summary = {
  openedCount: 0,
  analyzedCount: 0,
  pendingCount: 0,
  shouldReplyCount: 0,
  highPriorityCount: 0,
  labelCounts: {},
}

function formatDate(value?: string | null) {
  if (!value) return 'No timestamp'
  return new Date(value).toLocaleString()
}

function normalizeLabel(label?: string | null) {
  if (!label) return 'Pending'
  return label.replace(/_/g, ' ')
}

function badgeClass(status?: string | null) {
  switch (status) {
    case 'high':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    case 'medium':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'low':
      return 'border-slate-200 bg-slate-50 text-slate-700'
    case 'complete':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'pending':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'error':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    default:
      return 'border-black/10 bg-white text-[var(--text-secondary)]'
  }
}

export default function ResponsesPage() {
  const [items, setItems] = useState<ResponseReply[]>([])
  const [summary, setSummary] = useState<Summary>(DEFAULT_SUMMARY)
  const [accounts, setAccounts] = useState<MailAccountOption[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [mailAccountId, setMailAccountId] = useState('')
  const [analysisStatus, setAnalysisStatus] = useState('')
  const [label, setLabel] = useState('')
  const [priority, setPriority] = useState('')
  const [shouldReply, setShouldReply] = useState('')

  const loadResponses = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (search.trim()) params.set('search', search.trim())
    if (mailAccountId) params.set('mailAccountId', mailAccountId)
    if (analysisStatus) params.set('analysisStatus', analysisStatus)
    if (label) params.set('label', label)
    if (priority) params.set('priority', priority)
    if (shouldReply) params.set('shouldReply', shouldReply)

    const response = await fetch(`/api/responses?${params.toString()}`)
    const data = (await response.json()) as Payload & { error?: string }

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load responses')
    }

    setItems(data.items || data.replies || [])
    setSummary(data.summary || DEFAULT_SUMMARY)
    setAccounts(data.filters?.accounts || [])
    setTotal(data.total || 0)
    setPage(data.page || 1)
    setPages(data.pages || 1)
    setLimit(data.limit || 20)
    setLoading(false)
  }, [analysisStatus, label, limit, mailAccountId, page, priority, search, shouldReply])

  useEffect(() => {
    void loadResponses().catch(() => setLoading(false))
  }, [loadResponses])

  const labelOptions = useMemo(() => {
    const preferred = [
      'interested',
      'meeting_request',
      'follow_up_later',
      'wrong_person',
      'not_interested',
      'unsubscribe',
      'auto_reply',
      'generic',
    ]
    return preferred.filter((key) => summary.labelCounts[key] || label === key)
  }, [label, summary.labelCounts])

  return (
    <div className="animate-fade-in space-y-6">
      <section className="page-shell rounded-[34px] border border-white/70 px-8 py-8 shadow-[0_28px_80px_rgba(60,45,25,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl space-y-3">
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Responses</div>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[var(--text-primary)]">
              Opened reply insights for your outbound inbox.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
              Insights are generated only after a synced reply has been opened from the inbox or reply thread view. The cards summarize analyzed replies, and the list below shows the original sender, your mailbox, and the reply preview.
            </p>
          </div>
          <button className="btn-ghost" onClick={() => void loadResponses()}>
            Refresh
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          ['Opened replies', summary.openedCount, 'All opened inbound replies'],
          ['Analyzed', summary.analyzedCount, 'Replies with completed insight extraction'],
          ['Pending', summary.pendingCount, 'Opened replies still waiting for analysis'],
          ['Need reply', summary.shouldReplyCount, 'Replies the model flagged for follow-up'],
          ['High priority', summary.highPriorityCount, 'Replies that should be checked first'],
        ].map(([title, value, note]) => (
          <div key={title} className="rounded-[24px] border border-black/8 bg-white/90 p-5">
            <div className="text-sm uppercase tracking-[0.16em] text-[var(--text-muted)]">{title}</div>
            <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{value}</div>
            <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{note}</div>
          </div>
        ))}
      </section>

      <section className="rounded-[28px] border border-black/8 bg-white/90 p-6">
        <div className="grid gap-3 lg:grid-cols-6">
          <input
            className="input-base lg:col-span-2"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search sender, mailbox, subject, reply text, or insight"
          />
          <select
            className="input-base"
            value={mailAccountId}
            onChange={(event) => {
              setMailAccountId(event.target.value)
              setPage(1)
            }}
          >
            <option value="">All mailboxes</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.email}
              </option>
            ))}
          </select>
          <select
            className="input-base"
            value={analysisStatus}
            onChange={(event) => {
              setAnalysisStatus(event.target.value)
              setPage(1)
            }}
          >
            <option value="">All states</option>
            <option value="complete">Complete</option>
            <option value="pending">Pending</option>
            <option value="error">Error</option>
          </select>
          <select
            className="input-base"
            value={label}
            onChange={(event) => {
              setLabel(event.target.value)
              setPage(1)
            }}
          >
            <option value="">All labels</option>
            {labelOptions.map((entry) => (
              <option key={entry} value={entry}>
                {normalizeLabel(entry)}
              </option>
            ))}
          </select>
          <select
            className="input-base"
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value)
              setPage(1)
            }}
          >
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            className="input-base"
            value={shouldReply}
            onChange={(event) => {
              setShouldReply(event.target.value)
              setPage(1)
            }}
          >
            <option value="">Reply decision</option>
            <option value="true">Needs follow-up</option>
            <option value="false">No reply needed</option>
          </select>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(summary.labelCounts).map(([entry, count]) => (
            <span key={entry} className="rounded-full border border-black/8 bg-[#fcfbf8] px-3 py-1 text-sm text-[var(--text-secondary)]">
              {normalizeLabel(entry)}: {count}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-black/8 bg-white/90 p-6">
        {loading ? (
          <div className="py-12 text-sm text-[var(--text-muted)]">Loading opened reply insights...</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-sm text-[var(--text-muted)]">
            No opened replies match this view yet. Open a synced reply from the inbox or sent thread view to start analysis.
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="rounded-[24px] border border-black/8 bg-[#fcfbf8] p-5">
                <div className="flex flex-wrap justify-between gap-4">
                  <div className="max-w-4xl space-y-2">
                    <div className="text-base font-semibold text-[var(--text-primary)]">{item.subject || '(no subject)'}</div>
                    <div className="text-sm text-[var(--text-secondary)]">
                      Reply from {item.fromEmail || 'Unknown sender'} to {item.toEmail || item.mailAccount.email}
                    </div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Opened {formatDate(item.openedAt)} | Received {formatDate(item.receivedAt)} | Mailbox {item.mailAccount.email}
                    </div>
                  </div>
                  <div className="flex flex-wrap content-start gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] ${badgeClass(item.analysisStatus)}`}>
                      {item.analysisStatus}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] ${badgeClass(item.analysisPriority)}`}>
                      {item.analysisPriority || 'n/a'}
                    </span>
                    <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                      {normalizeLabel(item.analysisLabel)}
                    </span>
                  </div>
                </div>
                <div className="mt-4 rounded-[18px] border border-black/8 bg-white/80 p-4 text-sm leading-7 text-[var(--text-primary)]">
                  {item.snippet || 'No synced reply preview available yet.'}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  <div className="rounded-[18px] border border-black/8 bg-white/70 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Insight summary</div>
                    <div className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {item.analysisSummary || 'Waiting for analysis output.'}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {item.analysisReason || item.analysisError || 'The worker will populate this after the reply is analyzed.'}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-black/8 bg-white/70 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Action</div>
                    <div className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                      {item.analysisShouldReply === null
                        ? 'Decision pending'
                        : item.analysisShouldReply
                          ? 'Human follow-up suggested'
                          : 'No follow-up suggested'}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {item.analyzedAt
                        ? `Analyzed ${formatDate(item.analyzedAt)}${item.analysisModel ? ` using ${item.analysisModel}` : ''}.`
                        : 'This reply has been opened but has not been analyzed yet.'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5">
          <PaginationControls
            page={page}
            pages={pages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(nextLimit) => {
              setLimit(nextLimit)
              setPage(1)
            }}
            label="opened replies"
          />
        </div>
      </section>
    </div>
  )
}
