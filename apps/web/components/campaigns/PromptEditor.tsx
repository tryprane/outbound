'use client'

import { useState } from 'react'

interface Props {
  value: string
  onChange: (val: string) => void
  csvFileId: string
  campaignType: 'indian' | 'international'
}

export function PromptEditor({ value, onChange, csvFileId, campaignType }: Props) {
  const [previewing, setPreviewing] = useState(false)
  const [previewResult, setPreviewResult] = useState<{
    subject: string
    body: string
    usedRow: any
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewRowIndex, setPreviewRowIndex] = useState(0)

  const handlePreview = async (offset = 0) => {
    if (value.trim().length < 10) return

    setPreviewing(true)
    setError(null)
    const nextIndex = Math.max(0, previewRowIndex + offset)
    setPreviewRowIndex(nextIndex)

    try {
      const res = await fetch('/api/campaigns/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: value, campaignType, csvFileId, rowIndex: nextIndex }),
      })
      const data = await res.json()
      
      if (!res.ok) throw new Error(data.error)
      setPreviewResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
      
      {/* Editor Side */}
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            System Prompt for Gemini 2.5 Flash
          </label>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Instruct the AI on how to write the email. The AI will receive the agency name, website, and any scraped website data automatically.
          </div>
        </div>
        
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="You are a sales rep for OutreachOS. Write a short, punchy cold email to this digital marketing agency offering our white-label SEO services. Keep it under 100 words."
          style={{
            width: '100%', height: '240px', padding: '16px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '12px', color: 'var(--text-primary)', fontSize: '14px',
            lineHeight: 1.5, resize: 'vertical', outline: 'none',
            fontFamily: 'inherit'
          }}
        />

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <button
            onClick={() => handlePreview()}
            className="btn-primary"
            disabled={previewing || value.length < 10}
            style={{ opacity: previewing || value.length < 10 ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {previewing ? '⏳ Generating...' : '✨ Generate Preview'}
          </button>
        </div>
      </div>

      {/* Preview Side */}
      <div style={{ width: '400px', flexShrink: 0 }}>
        {error && (
          <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', color: 'var(--error)', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {previewResult ? (
          <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' 
            }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                AI Preview Output
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => handlePreview(-1)} 
                  disabled={previewRowIndex === 0 || previewing}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}
                >
                  &larr; Prev
                </button>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                  Row {previewRowIndex + 1}
                </div>
                <button 
                  onClick={() => handlePreview(1)} 
                  disabled={previewing}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}
                >
                  Next &rarr;
                </button>
              </div>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              <strong>Context:</strong> {previewResult.usedRow?.name || 'Unknown'} — {previewResult.usedRow?.website || 'No website'}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Subject</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{previewResult.subject}</div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Body</div>
              <div style={{ 
                fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, 
                background: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px',
                whiteSpace: 'pre-wrap'
              }}>
                {previewResult.body}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ 
            height: '100%', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px dashed var(--border)', borderRadius: '12px', background: 'var(--bg-secondary)',
            color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '32px'
          }}>
            <div>
              <div style={{ fontSize: '24px', marginBottom: '12px' }}>👀</div>
              Click Generate Preview to see how the AI writes emails using your prompt and sample CSV data.
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
