'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface CsvFileRecord {
  id: string
  originalName: string
  rowCount: number
  uploadedAt: string
  _count: { campaigns: number }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function CsvListPage() {
  const [files, setFiles] = useState<CsvFileRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/csv/upload')
      .then((r) => r.json())
      .then((data) => { setFiles(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    await fetch(`/api/csv/${id}`, { method: 'DELETE' })
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            CSV Files
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Upload and manage your agency lead datasets
          </p>
        </div>
        <Link href="/csv/upload">
          <button className="btn-primary">⬆️ Upload CSV</button>
        </Link>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px' }}>
          Loading datasets...
        </div>
      ) : files.length === 0 ? (
        <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            No CSV files yet
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Upload a CSV to get started with your outreach campaign
          </div>
          <Link href="/csv/upload">
            <button className="btn-primary">⬆️ Upload your first CSV</button>
          </Link>
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                {['File Name', 'Rows', 'Campaigns', 'Uploaded', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {files.map((file, i) => (
                <tr key={file.id} style={{
                  borderBottom: i < files.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '20px' }}>📄</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {file.originalName}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{file.rowCount.toLocaleString()}</span>
                    <span style={{ color: 'var(--text-muted)' }}> rows</span>
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                    {file._count.campaigns} campaign{file._count.campaigns !== 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                    {formatDate(file.uploadedAt)}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Link href={`/csv/${file.id}`}>
                        <button className="btn-ghost" style={{ padding: '6px 14px', fontSize: '12px' }}>
                          View
                        </button>
                      </Link>
                      <button
                        onClick={() => handleDelete(file.id, file.originalName)}
                        style={{
                          padding: '6px 14px',
                          fontSize: '12px',
                          background: 'transparent',
                          border: '1px solid rgba(239,68,68,0.3)',
                          color: 'var(--error)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
