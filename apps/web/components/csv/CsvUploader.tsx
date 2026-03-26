'use client'

import { useState, useRef } from 'react'

interface UploadResult {
  id: string
  originalName: string
  rowCount: number
  headers: string[]
  detectedMapping: Record<string, string>
  preview: Record<string, string>[]
}

interface CsvUploaderProps {
  onUploadComplete: (result: UploadResult) => void
}

export function CsvUploader({ onUploadComplete }: CsvUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a .csv file only.')
      return
    }
    setError(null)
    setUploading(true)
    setProgress(20)

    try {
      const formData = new FormData()
      formData.append('file', file)

      setProgress(50)
      const res = await fetch('/api/csv/upload', { method: 'POST', body: formData })
      setProgress(80)

      if (!res.ok) {
        const { error: msg } = await res.json()
        throw new Error(msg || 'Upload failed')
      }

      const data: UploadResult = await res.json()
      setProgress(100)
      setTimeout(() => {
        setUploading(false)
        setProgress(0)
        onUploadComplete(data)
      }, 400)
    } catch (err) {
      setUploading(false)
      setProgress(0)
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
        style={{
          border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: '12px',
          padding: '48px 32px',
          textAlign: 'center',
          cursor: uploading ? 'not-allowed' : 'pointer',
          background: isDragging ? 'var(--accent-light)' : 'var(--bg-secondary)',
          transition: 'all 0.2s',
          opacity: uploading ? 0.7 : 1,
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
          {uploading ? 'Uploading...' : 'Drop your CSV here'}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          or click to browse — only <strong>.csv</strong> files accepted
        </div>

        {/* Progress bar */}
        {uploading && (
          <div style={{
            marginTop: '20px',
            height: '4px',
            background: 'var(--border)',
            borderRadius: '2px',
            overflow: 'hidden',
            maxWidth: '280px',
            margin: '20px auto 0',
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: 'var(--accent)',
              borderRadius: '2px',
              transition: 'width 0.3s ease',
            }}/>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />

      {/* Error message */}
      {error && (
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          color: 'var(--error)',
          fontSize: '13px',
        }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  )
}
