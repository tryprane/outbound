'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CampaignTypeSelector } from './CampaignTypeSelector'
import { CampaignModeSelector, type CampaignMode } from './CampaignModeSelector'
import { DataEnrichmentOptions } from './DataEnrichmentOptions'
import { MailDistributionPlanner } from './MailDistributionPlanner'
import { PromptEditor } from './PromptEditor'

type CampaignType = 'indian' | 'international'

interface CsvFile {
  id: string
  originalName: string
  rowCount: number
}

interface WhatsAppAccount {
  id: string
  displayName: string
  phoneNumber: string | null
  isActive: boolean
  connectionStatus: 'DISCONNECTED' | 'QR_PENDING' | 'CONNECTED' | 'ERROR'
}

const EMAIL_DEFAULT_PROMPT = `You are a sales rep for OutreachOS.
Write a short, punchy cold email to this digital marketing agency offering our white-label SEO services.
Keep it under 100 words and highly personalized.`

const WHATSAPP_DEFAULT_PROMPT = `You are writing WhatsApp outreach for B2B lead generation.
Write a human-like first message in under 80 words.
Make it personalized to the lead's company details, polite, and action-oriented.`

function inferWebsiteColumn(headers: string[]): string {
  const preferred = headers.find((h) => /website|url|domain|site/i.test(h))
  return preferred || headers[0] || ''
}

function inferPhoneColumn(headers: string[]): string {
  const preferred = headers.find((h) => /phone|mobile|whatsapp|contact|number/i.test(h))
  return preferred || headers[0] || ''
}

export function CampaignWizard() {
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<CampaignMode>('email')
  const [name, setName] = useState('')
  const [type, setType] = useState<CampaignType>('indian')
  const [csvFileId, setCsvFileId] = useState('')
  const [csvFiles, setCsvFiles] = useState<CsvFile[]>([])
  const [csvLoading, setCsvLoading] = useState(true)

  const [websiteColumn, setWebsiteColumn] = useState('')
  const [whatsappColumn, setWhatsappColumn] = useState('')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])

  const [scrapeEmail, setScrapeEmail] = useState(true)
  const [scrapeWhatsapp, setScrapeWhatsapp] = useState(true)

  const [mailAccountIds, setMailAccountIds] = useState<string[]>([])
  const [whatsappAccounts, setWhatsappAccounts] = useState<WhatsAppAccount[]>([])
  const [whatsappAccountIds, setWhatsappAccountIds] = useState<string[]>([])
  const [dailyMailsPerAccount, setDailyMailsPerAccount] = useState(40)
  const [prompt, setPrompt] = useState(EMAIL_DEFAULT_PROMPT)

  const steps =
    mode === 'email'
      ? ['Basics', 'Enrichment', 'Distribution', 'AI Prompt', 'Review']
      : mode === 'whatsapp'
        ? ['Basics', 'WhatsApp Setup', 'AI Prompt', 'Review']
        : ['Setup', 'Extract Options', 'Review']

  useEffect(() => {
    fetch('/api/csv/upload')
      .then((res) => res.json())
      .then((data) => {
        setCsvFiles(Array.isArray(data) ? data : [])
        setCsvLoading(false)
      })
      .catch(() => setCsvLoading(false))

    fetch('/api/mail-accounts?resource=whatsapp-accounts')
      .then((res) => res.json())
      .then((data) => setWhatsappAccounts(Array.isArray(data) ? data : []))
      .catch(() => setWhatsappAccounts([]))
  }, [])

  useEffect(() => {
    setStep(1)
    setError(null)
    if (mode === 'email') setPrompt(EMAIL_DEFAULT_PROMPT)
    if (mode === 'whatsapp') setPrompt(WHATSAPP_DEFAULT_PROMPT)
  }, [mode])

  useEffect(() => {
    if (!csvFileId) {
      setCsvHeaders([])
      setWebsiteColumn('')
      setWhatsappColumn('')
      return
    }

    fetch(`/api/csv/${csvFileId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((csvData) => {
        const firstRow = csvData?.rows?.[0]?.rawData || {}
        const headers = Object.keys(firstRow)
        setCsvHeaders(headers)
        const columnMap = (csvData?.columnMap || {}) as Record<string, string>
        const mappedWebsite = Object.keys(columnMap).find((col) => columnMap[col] === 'website')
        const mappedPhone = Object.keys(columnMap).find((col) => columnMap[col] === 'phone')
        setWebsiteColumn(mappedWebsite || inferWebsiteColumn(headers))
        setWhatsappColumn(mappedPhone || inferPhoneColumn(headers))
      })
      .catch(() => {
        setCsvHeaders([])
        setWebsiteColumn('')
        setWhatsappColumn('')
      })
  }, [csvFileId])

  const eligibleWhatsAppAccounts = whatsappAccounts.filter((a) => a.isActive && a.connectionStatus === 'CONNECTED')
  const maxStep = steps.length

  const canGoNext = () => {
    if (mode === 'email') {
      if (step === 1) return name.trim().length > 0 && csvFileId !== ''
      if (step === 2) return true
      if (step === 3) return mailAccountIds.length > 0 && dailyMailsPerAccount > 0
      if (step === 4) return prompt.trim().length >= 10
      return true
    }
    if (mode === 'whatsapp') {
      if (step === 1) return name.trim().length > 0 && csvFileId !== ''
      if (step === 2) return whatsappColumn.trim().length > 0 && whatsappAccountIds.length > 0 && dailyMailsPerAccount > 0
      if (step === 3) return prompt.trim().length >= 10
      return true
    }
    if (step === 1) return name.trim().length > 0 && csvFileId !== '' && websiteColumn !== ''
    if (step === 2) return scrapeEmail || scrapeWhatsapp
    return true
  }

  const launchEmailCampaign = async () => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'email',
        name,
        type,
        csvFileId,
        scrapeEmail,
        scrapeWhatsapp,
        dailyMailsPerAccount,
        mailAccountIds,
        prompt,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to create campaign')
    const startRes = await fetch(`/api/campaigns/${data.id}/start`, { method: 'POST' })
    if (!startRes.ok) throw new Error('Campaign created but failed to start')
    router.push('/campaigns')
  }

  const launchWhatsAppCampaign = async () => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'whatsapp',
        name,
        type,
        csvFileId,
        prompt,
        whatsappColumn,
        dailyMailsPerAccount,
        whatsappAccountIds,
        scrapeEmail: false,
        scrapeWhatsapp: false,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to create WhatsApp campaign')
    const startRes = await fetch(`/api/campaigns/${data.id}/start`, { method: 'POST' })
    if (!startRes.ok) throw new Error('Campaign created but failed to start')
    router.push('/campaigns')
  }

  const runExtractionCampaign = async () => {
    const res = await fetch('/api/csv/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceCsvFileId: csvFileId,
        extractionName: name,
        campaignType: type,
        websiteColumn,
        extractEmail: scrapeEmail,
        extractPhone: scrapeWhatsapp,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to run extraction campaign')
    router.push(`/csv/${data.csvFile.id}`)
  }

  const handleLaunch = async () => {
    setSaving(true)
    setError(null)
    try {
      if (mode === 'email') await launchEmailCampaign()
      if (mode === 'whatsapp') await launchWhatsAppCampaign()
      if (mode === 'extract') await runExtractionCampaign()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setSaving(false)
    }
  }

  const renderCsvSelector = () => (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
        Source CSV
      </label>
      {csvLoading ? (
        <div style={{ padding: '14px', color: 'var(--text-muted)' }}>Loading CSVs...</div>
      ) : csvFiles.length === 0 ? (
        <div style={{ padding: '16px', background: 'rgba(239,68,68,0.05)', border: '1px dashed rgba(239,68,68,0.3)', borderRadius: '10px', color: 'var(--error)' }}>
          Upload a CSV first from Data {`>`} Upload CSV.
        </div>
      ) : (
        <select
          value={csvFileId}
          onChange={(e) => setCsvFileId(e.target.value)}
          style={{ width: '100%', padding: '13px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '14px' }}
        >
          <option value="" disabled>Select CSV...</option>
          {csvFiles.map((csv) => (
            <option key={csv.id} value={csv.id}>
              {csv.originalName} ({csv.rowCount.toLocaleString()} rows)
            </option>
          ))}
        </select>
      )}
    </div>
  )

  const renderWhatsAppAccountSelector = () => (
    <div className="glass-card" style={{ padding: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
        WhatsApp Sender Accounts (Round Robin)
      </div>
      {eligibleWhatsAppAccounts.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--warning)' }}>
          No ACTIVE + CONNECTED WhatsApp account found. Connect from Mail Accounts page first.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {eligibleWhatsAppAccounts.map((account) => {
            const selected = whatsappAccountIds.includes(account.id)
            return (
              <button
                key={account.id}
                type="button"
                onClick={() =>
                  setWhatsappAccountIds((prev) =>
                    selected ? prev.filter((id) => id !== account.id) : [...prev, account.id]
                  )
                }
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'var(--accent-light)' : 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{account.displayName}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{account.phoneNumber || 'No number'}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderStep = () => {
    if (mode === 'email') {
      if (step === 1) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase' }}>Campaign Type</label>
              <CampaignModeSelector value={mode} onChange={setMode} />
            </div>
            <input
              type="text"
              placeholder="Campaign name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '13px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)' }}
            />
            <CampaignTypeSelector value={type} onChange={setType} />
            {renderCsvSelector()}
          </div>
        )
      }
      if (step === 2) {
        return (
          <DataEnrichmentOptions
            scrapeEmail={scrapeEmail}
            onScrapeEmailChange={setScrapeEmail}
            scrapeWhatsapp={scrapeWhatsapp}
            onScrapeWhatsappChange={setScrapeWhatsapp}
          />
        )
      }
      if (step === 3) {
        return (
          <MailDistributionPlanner
            selectedAccountIds={mailAccountIds}
            onChange={setMailAccountIds}
            dailyMailsPerAccount={dailyMailsPerAccount}
            onDailyMailsChange={setDailyMailsPerAccount}
          />
        )
      }
      if (step === 4) {
        return <PromptEditor value={prompt} onChange={setPrompt} csvFileId={csvFileId} campaignType={type} />
      }
      return (
        <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>Ready to Launch Email Campaign</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{name}</p>
        </div>
      )
    }

    if (mode === 'whatsapp') {
      if (step === 1) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase' }}>Campaign Type</label>
              <CampaignModeSelector value={mode} onChange={setMode} />
            </div>
            <input
              type="text"
              placeholder="WhatsApp campaign name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '13px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)' }}
            />
            <CampaignTypeSelector value={type} onChange={setType} />
            {renderCsvSelector()}
          </div>
        )
      }
      if (step === 2) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                Phone Column Mapping
              </label>
              <select
                value={whatsappColumn}
                onChange={(e) => setWhatsappColumn(e.target.value)}
                style={{ width: '100%', padding: '13px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)' }}
              >
                {csvHeaders.map((header) => (
                  <option key={header} value={header}>{header}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                Daily Limit Per WhatsApp Account
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={dailyMailsPerAccount}
                onChange={(e) => setDailyMailsPerAccount(Math.max(1, Number(e.target.value || 1)))}
                style={{ width: '100%', padding: '13px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)' }}
              />
            </div>
            {renderWhatsAppAccountSelector()}
          </div>
        )
      }
      if (step === 3) {
        return (
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              WhatsApp AI Prompt
            </label>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Tell Gemini why this campaign exists and how the message should sound.
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={{
                width: '100%',
                height: '220px',
                padding: '14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                lineHeight: 1.5,
                resize: 'vertical',
              }}
            />
          </div>
        )
      }
      return (
        <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>Ready to Launch WhatsApp Campaign</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            {name} with {whatsappAccountIds.length} sender account(s) and {dailyMailsPerAccount}/day per account
          </p>
        </div>
      )
    }

    if (step === 1) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase' }}>Campaign Type</label>
            <CampaignModeSelector value={mode} onChange={setMode} />
          </div>
          <input
            type="text"
            placeholder="Extraction campaign name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', padding: '13px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)' }}
          />
          <CampaignTypeSelector value={type} onChange={setType} />
          {renderCsvSelector()}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
              Website Column Mapping
            </label>
            <select
              value={websiteColumn}
              onChange={(e) => setWebsiteColumn(e.target.value)}
              style={{ width: '100%', padding: '13px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)' }}
            >
              {csvHeaders.map((header) => (
                <option key={header} value={header}>{header}</option>
              ))}
            </select>
          </div>
        </div>
      )
    }
    if (step === 2) {
      return (
        <DataEnrichmentOptions
          scrapeEmail={scrapeEmail}
          onScrapeEmailChange={setScrapeEmail}
          scrapeWhatsapp={scrapeWhatsapp}
          onScrapeWhatsappChange={setScrapeWhatsapp}
        />
      )
    }
    return (
      <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>Ready to Run Extraction</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{name}</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div className="glass-card" style={{ padding: '18px', marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {steps.map((label, index) => {
          const n = index + 1
          const active = n === step
          const done = n < step
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: active ? 'var(--accent)' : done ? 'var(--success)' : 'var(--bg-secondary)', color: active || done ? 'white' : 'var(--text-muted)' }}>
                {done ? 'OK' : n}
              </div>
              <span style={{ fontSize: '12px', color: active || done ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
            </div>
          )
        })}
      </div>

      <div className="glass-card" style={{ padding: '28px', minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>{renderStep()}</div>

        {error ? (
          <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: 'var(--error)', fontSize: '13px' }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px', borderTop: '1px solid var(--border)', paddingTop: '18px' }}>
          <button
            onClick={() => setStep((prev) => Math.max(1, prev - 1))}
            className="btn-ghost"
            style={{ visibility: step === 1 ? 'hidden' : 'visible' }}
          >
            Back
          </button>

          {step < maxStep ? (
            <button
              onClick={() => setStep((prev) => Math.min(maxStep, prev + 1))}
              className="btn-primary"
              disabled={!canGoNext()}
              style={{ opacity: canGoNext() ? 1 : 0.6 }}
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              className="btn-primary"
              disabled={saving || !canGoNext()}
              style={{ background: 'var(--success)', color: 'white', opacity: canGoNext() ? 1 : 0.6 }}
            >
              {saving ? 'Launching...' : mode === 'extract' ? 'Run Extraction Campaign' : 'Launch Campaign'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
