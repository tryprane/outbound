'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CsvUploader } from '@/components/csv/CsvUploader'
import { ColumnMapper } from '@/components/csv/ColumnMapper'
import { CsvPreviewTable } from '@/components/csv/CsvPreviewTable'
import { ColumnMapping } from '@/lib/csv-parser/column-detector'

type UploadResult = {
  id: string
  originalName: string
  rowCount: number
  headers: string[]
  detectedMapping: ColumnMapping
  preview: Record<string, string>[]
}

type WizardStep = 'upload' | 'map' | 'done'

export default function UploadCsvPage() {
  const router = useRouter()
  const [step, setStep] = useState<WizardStep>('upload')
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)

  const steps = [
    { key: 'upload', label: '1. Upload CSV', icon: '⬆️' },
    { key: 'map', label: '2. Map Columns', icon: '🗂️' },
    { key: 'done', label: '3. Done', icon: '✅' },
  ]

  return (
    <div className="animate-fade-in" style={{ maxWidth: '860px' }}>
      {/* Page header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Upload CSV
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Upload your agency leads CSV — we&apos;ll auto-detect column mappings for you.
        </p>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '32px' }}>
        {steps.map((s, i) => {
          const isActive = s.key === step
          const isDone = steps.findIndex(x => x.key === step) > i
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                background: isActive ? 'var(--accent-light)' : 'transparent',
                border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
              }}>
                <span style={{ fontSize: '16px' }}>{isDone ? '✅' : s.icon}</span>
                <span style={{
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--accent)' : isDone ? 'var(--success)' : 'var(--text-muted)',
                }}>{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: '1px', background: 'var(--border)', margin: '0 8px' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="glass-card" style={{ padding: '28px' }}>
          <CsvUploader
            onUploadComplete={(result) => {
              setUploadResult(result)
              setStep('map')
            }}
          />
        </div>
      )}

      {/* Step: Map columns */}
      {step === 'map' && uploadResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* File info */}
          <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '24px' }}>📄</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{uploadResult.originalName}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {uploadResult.rowCount.toLocaleString()} rows · {uploadResult.headers.length} columns
              </div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--success)' }}>
              ✅ Uploaded successfully
            </div>
          </div>

          {/* Preview table */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Preview (first 5 rows)
            </div>
            <CsvPreviewTable
              headers={uploadResult.headers}
              rows={uploadResult.preview}
              highlightColumns={
                Object.fromEntries(
                  Object.entries(uploadResult.detectedMapping)
                    .filter(([, f]) => f !== 'ignore')
                ) as Record<string, string>
              }
            />
          </div>

          {/* Column mapper */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <ColumnMapper
              csvFileId={uploadResult.id}
              headers={uploadResult.headers}
              currentMapping={uploadResult.detectedMapping}
              preview={uploadResult.preview}
              onMappingSaved={() => setStep('done')}
            />
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && uploadResult && (
        <div className="glass-card animate-fade-in" style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>🎉</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            CSV Ready!
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{uploadResult.originalName}</strong> has been imported
            with <strong style={{ color: 'var(--accent)' }}>{uploadResult.rowCount.toLocaleString()} rows</strong>.
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '32px' }}>
            Column mapping saved. All rows have been updated with mapped fields.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button className="btn-primary" onClick={() => router.push('/campaigns/new')}>
              ⚡ Create Campaign
            </button>
            <button className="btn-ghost" onClick={() => router.push('/csv')}>
              📂 View All CSVs
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
