'use client'

import { useState } from 'react'
import {
  StandardField,
  STANDARD_FIELD_LABELS,
  ColumnMapping,
} from '@/lib/csv-parser/column-detector'

interface ColumnMapperProps {
  csvFileId: string
  headers: string[]
  currentMapping: ColumnMapping
  preview: Record<string, string>[]
  onMappingSaved: () => void
}

const FIELD_OPTIONS: StandardField[] = ['name', 'website', 'email', 'phone', 'ignore']

const FIELD_COLORS: Record<StandardField, string> = {
  name: '#6366f1',
  website: '#22d3a5',
  email: '#f59e0b',
  phone: '#a78bfa',
  ignore: 'var(--text-muted)',
}

export function ColumnMapper({
  csvFileId,
  headers,
  currentMapping,
  preview,
  onMappingSaved,
}: ColumnMapperProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(currentMapping)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const handleChange = (header: string, field: StandardField) => {
    setMapping((prev) => {
      // If same field was assigned elsewhere, remove it first
      const next = { ...prev }
      if (field !== 'ignore') {
        for (const h of Object.keys(next)) {
          if (next[h] === field && h !== header) next[h] = 'ignore'
        }
      }
      next[header] = field
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setSavedMsg('')
    try {
      const res = await fetch('/api/csv/map-columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: csvFileId, columnMap: mapping }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setSavedMsg('✅ Column mapping saved! All rows updated.')
      setTimeout(onMappingSaved, 1500)
    } catch {
      setSavedMsg('❌ Failed to save mapping. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Count how many standard fields are mapped
  const mappedCount = Object.values(mapping).filter((f) => f !== 'ignore').length
  const requiredMapped = ['email'].every((f) =>
    Object.values(mapping).includes(f as StandardField)
  )

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Map CSV Columns
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          We detected {mappedCount} field(s) automatically. Confirm or adjust the mappings below.
        </p>
      </div>

      {/* Mapping rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
        {headers.map((header) => {
          const field = mapping[header] || 'ignore'
          const sampleValues = preview
            .map((row) => row[header])
            .filter(Boolean)
            .slice(0, 3)

          return (
            <div
              key={header}
              className="glass-card flex-col sm:flex-row sm:items-center"
              style={{
                padding: '14px 16px',
                display: 'flex',
                gap: '16px',
                borderLeft: `3px solid ${FIELD_COLORS[field]}`,
              }}
            >
              {/* Column name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                  {header}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sampleValues.join(' · ') || 'No sample data'}
                </div>
              </div>

              {/* Arrow */}
              <div style={{ color: 'var(--text-muted)', fontSize: '16px' }}>→</div>

              {/* Mapping selector */}
              <select
                value={field}
                onChange={(e) => handleChange(header, e.target.value as StandardField)}
                className="input-base"
                style={{ width: 'min(220px, 100%)', flexShrink: 0, fontSize: '13px' }}
              >
                {FIELD_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {STANDARD_FIELD_LABELS[opt]}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        marginBottom: '20px',
      }}>
        {(Object.entries(mapping) as [string, StandardField][])
          .filter(([, f]) => f !== 'ignore')
          .map(([col, field]) => (
            <span key={col} style={{
              padding: '4px 10px',
              borderRadius: '20px',
              background: `${FIELD_COLORS[field]}20`,
              color: FIELD_COLORS[field],
              fontSize: '12px',
              fontWeight: 500,
            }}>
              {col} → {field}
            </span>
          ))}
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving || !requiredMapped}
          style={{ opacity: saving || !requiredMapped ? 0.6 : 1, cursor: saving || !requiredMapped ? 'not-allowed' : 'pointer' }}
        >
          {saving ? '⏳ Saving...' : '💾 Save Mapping'}
        </button>
        {!requiredMapped && (
          <span style={{ fontSize: '12px', color: 'var(--warning)' }}>
            ⚠️ At least one email column must be mapped
          </span>
        )}
        {savedMsg && (
          <span style={{ fontSize: '13px', color: savedMsg.startsWith('✅') ? 'var(--success)' : 'var(--error)' }}>
            {savedMsg}
          </span>
        )}
      </div>
    </div>
  )
}
