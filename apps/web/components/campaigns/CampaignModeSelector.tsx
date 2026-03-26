'use client'

export type CampaignMode = 'email' | 'whatsapp' | 'extract'

interface CampaignModeSelectorProps {
  value: CampaignMode
  onChange: (mode: CampaignMode) => void
}

const options: Array<{ mode: CampaignMode; icon: string; label: string; desc: string }> = [
  {
    mode: 'email',
    icon: 'Email',
    label: 'Email Campaign',
    desc: 'Create and launch AI-personalized outbound email campaigns.',
  },
  {
    mode: 'whatsapp',
    icon: 'WA',
    label: 'WhatsApp Campaign',
    desc: 'Send AI-personalized WhatsApp campaigns with round-robin sender rotation.',
  },
  {
    mode: 'extract',
    icon: 'Extract',
    label: 'Extracting Campaign',
    desc: 'Extract email/mobile data from websites and generate an enriched CSV.',
  },
]

export function CampaignModeSelector({ value, onChange }: CampaignModeSelectorProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
      {options.map((opt) => {
        const selected = value === opt.mode
        return (
          <button
            key={opt.mode}
            type="button"
            onClick={() => onChange(opt.mode)}
            style={{
              borderRadius: '12px',
              border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
              background: selected ? 'var(--accent-light)' : 'var(--bg-secondary)',
              padding: '16px',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700, color: selected ? 'var(--accent)' : 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
              {opt.icon}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: selected ? 'var(--accent)' : 'var(--text-primary)', marginBottom: '4px' }}>
              {opt.label}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {opt.desc}
            </div>
          </button>
        )
      })}
    </div>
  )
}
