import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { StatusBadge } from '@/components/shared/StatusBadge'

export const dynamic = 'force-dynamic'

interface Props {
  params: { id: string }
}

export default async function CsvDetailPage({ params }: Props) {
  const csvFile = await prisma.csvFile.findUnique({
    where: { id: params.id },
    include: {
      rows: { orderBy: { rowIndex: 'asc' }, take: 100 },
      _count: { select: { rows: true, campaigns: true } },
    },
  })

  if (!csvFile) notFound()

  const columnMap = csvFile.columnMap as Record<string, string>

  // Stats
  const totalRows = csvFile._count.rows
  const rowsWithEmail = csvFile.rows.filter((r) => r.email).length
  const rowsWithPhone = csvFile.rows.filter((r) => r.whatsapp).length
  const emailPct = totalRows > 0 ? Math.round((rowsWithEmail / totalRows) * 100) : 0
  const phonePct = totalRows > 0 ? Math.round((rowsWithPhone / totalRows) * 100) : 0

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb + header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          <Link href="/csv" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>CSV Files</Link>
          {' / '}
          <span style={{ color: 'var(--text-secondary)' }}>{csvFile.originalName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              📄 {csvFile.originalName}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {csvFile._count.campaigns} campaign{csvFile._count.campaigns !== 1 ? 's' : ''} using this file
            </p>
          </div>
          <Link href="/campaigns/new">
            <button className="btn-primary">⚡ Use in Campaign</button>
          </Link>
        </div>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Rows', value: totalRows.toLocaleString(), color: 'var(--accent)' },
          {
            label: 'Email Coverage',
            value: `${emailPct}%`,
            sub: `${rowsWithEmail} rows have email`,
            color: emailPct > 70 ? 'var(--success)' : 'var(--warning)',
          },
          {
            label: 'Phone Coverage',
            value: `${phonePct}%`,
            sub: `${rowsWithPhone} rows have phone`,
            color: phonePct > 50 ? 'var(--success)' : 'var(--warning)',
          },
        ].map((s) => (
          <div key={s.label} className="glass-card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{s.label}</div>
            {s.sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Column mapping info */}
      <div className="glass-card" style={{ padding: '18px 20px', marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Column Mapping
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {Object.entries(columnMap)
            .filter(([, f]) => f !== 'ignore')
            .map(([col, field]) => (
              <span key={col} style={{
                padding: '4px 10px',
                borderRadius: '20px',
                background: 'var(--accent-light)',
                color: 'var(--accent)',
                fontSize: '12px',
                fontWeight: 500,
              }}>
                {col} → {field}
              </span>
            ))}
        </div>
      </div>

      {/* Row table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Rows <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '12px' }}>(showing first 100 of {totalRows.toLocaleString()})</span>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                {['#', 'Name', 'Website', 'Email', 'Phone/WA', 'Scraped Email', 'Scrape Status'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {csvFile.rows.map((row, i) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', fontSize: '12px' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{row.rowIndex + 1}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-primary)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.website ? (
                      <a href={row.website.startsWith('http') ? row.website : `https://${row.website}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--success)', textDecoration: 'none', fontSize: '12px' }}>
                        🌐 {row.website}
                      </a>
                    ) : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: row.email ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: row.email ? 'normal' : 'italic' }}>
                    {row.email || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                    {row.whatsapp || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--success)' }}>
                    {row.scrapedEmail || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <StatusBadge status={row.scrapeStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
