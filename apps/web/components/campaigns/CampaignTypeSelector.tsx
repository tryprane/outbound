'use client'

type CampaignType = 'indian' | 'international'

interface CampaignTypeSelectorProps {
  value: CampaignType
  onChange: (type: CampaignType) => void
}

const options: { type: CampaignType; flag: string; label: string; desc: string; phoneFormat: string }[] = [
  {
    type: 'indian',
    flag: '🇮🇳',
    label: 'Indian Campaign',
    desc: 'Target digital marketing agencies in India',
    phoneFormat: 'Phone: +91 XXXXXXXXXX (10-digit)',
  },
  {
    type: 'international',
    flag: '🌍',
    label: 'International Campaign',
    desc: 'Target agencies globally (US, UK, AU, CA, etc.)',
    phoneFormat: 'Phone: E.164 format (+1, +44, +61…)',
  },
]

export function CampaignTypeSelector({ value, onChange }: CampaignTypeSelectorProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      {options.map((opt) => {
        const selected = value === opt.type
        return (
          <button
            key={opt.type}
            onClick={() => onChange(opt.type)}
            style={{
              padding: '20px',
              borderRadius: '12px',
              border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
              background: selected ? 'var(--accent-light)' : 'var(--bg-secondary)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>{opt.flag}</div>
            <div style={{
              fontSize: '15px', fontWeight: 700,
              color: selected ? 'var(--accent)' : 'var(--text-primary)',
              marginBottom: '6px',
            }}>
              {opt.label}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.5 }}>
              {opt.desc}
            </div>
            <div style={{
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '6px',
              background: selected ? 'rgba(99,102,241,0.15)' : 'var(--bg-card)',
              color: selected ? 'var(--accent)' : 'var(--text-muted)',
              display: 'inline-block',
            }}>
              {opt.phoneFormat}
            </div>
            {selected && (
              <div style={{
                marginTop: '10px',
                fontSize: '11px',
                color: 'var(--accent)',
                fontWeight: 600,
              }}>
                ✓ Selected
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
