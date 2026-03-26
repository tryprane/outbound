'use client'

interface CsvPreviewTableProps {
  headers: string[]
  rows: Record<string, string>[]
  highlightColumns?: Record<string, string> // col → field name for color highlight
  maxRows?: number
}

const HEADER_COLORS: Record<string, string> = {
  name: '#6366f1',
  website: '#22d3a5',
  email: '#f59e0b',
  phone: '#a78bfa',
}

export function CsvPreviewTable({
  headers,
  rows,
  highlightColumns = {},
  maxRows = 5,
}: CsvPreviewTableProps) {
  const displayRows = rows.slice(0, maxRows)

  return (
    <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, width: '40px' }}>
              #
            </th>
            {headers.map((h) => {
              const field = highlightColumns[h]
              const color = field ? HEADER_COLORS[field] : undefined
              return (
                <th
                  key={h}
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    color: color || 'var(--text-secondary)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    borderLeft: color ? `2px solid ${color}` : undefined,
                  }}
                >
                  {h}
                  {field && (
                    <span style={{
                      marginLeft: '6px',
                      fontSize: '10px',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      background: `${color}20`,
                      color,
                    }}>
                      {field}
                    </span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, i) => (
            <tr
              key={i}
              style={{
                borderBottom: i < displayRows.length - 1 ? '1px solid var(--border)' : 'none',
                background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
              }}
            >
              <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{i + 1}</td>
              {headers.map((h) => (
                <td key={h} style={{
                  padding: '10px 14px',
                  color: 'var(--text-primary)',
                  maxWidth: '200px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {row[h] || (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length > maxRows && (
        <div style={{
          padding: '10px 14px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '12px',
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
        }}>
          Showing {maxRows} of {rows.length} rows
        </div>
      )}
    </div>
  )
}
