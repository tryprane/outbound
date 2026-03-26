'use client'

interface Props {
  scrapeEmail: boolean
  onScrapeEmailChange: (val: boolean) => void
  scrapeWhatsapp: boolean
  onScrapeWhatsappChange: (val: boolean) => void
}

export function DataEnrichmentOptions({
  scrapeEmail, onScrapeEmailChange,
  scrapeWhatsapp, onScrapeWhatsappChange
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Option 1: Scrape Email */}
      <button
        onClick={() => onScrapeEmailChange(!scrapeEmail)}
        style={{
          display: 'flex', alignItems: 'center', gap: '16px',
          padding: '20px', borderRadius: '12px', textAlign: 'left',
          background: scrapeEmail ? 'rgba(99,102,241,0.08)' : 'var(--bg-secondary)',
          border: `1px solid ${scrapeEmail ? 'var(--accent)' : 'var(--border)'}`,
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        <div style={{
          width: '24px', height: '24px', borderRadius: '6px',
          background: scrapeEmail ? 'var(--accent)' : 'var(--bg-card)',
          border: `1px solid ${scrapeEmail ? 'var(--accent)' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', flexShrink: 0,
        }}>
          {scrapeEmail && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
        </div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Scrape Missing Emails
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            If a row has a website but no email, the scraper will visit the website and look for one.
          </div>
        </div>
      </button>

      {/* Option 2: Scrape Phone */}
      <button
        onClick={() => onScrapeWhatsappChange(!scrapeWhatsapp)}
        style={{
          display: 'flex', alignItems: 'center', gap: '16px',
          padding: '20px', borderRadius: '12px', textAlign: 'left',
          background: scrapeWhatsapp ? 'rgba(34,211,165,0.08)' : 'var(--bg-secondary)',
          border: `1px solid ${scrapeWhatsapp ? 'rgba(34,211,165,0.5)' : 'var(--border)'}`,
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        <div style={{
          width: '24px', height: '24px', borderRadius: '6px',
          background: scrapeWhatsapp ? 'var(--success)' : 'var(--bg-card)',
          border: `1px solid ${scrapeWhatsapp ? 'var(--success)' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', flexShrink: 0,
        }}>
          {scrapeWhatsapp && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
        </div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Scrape Phone / WhatsApp Numbers
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            The scraper will extract phone numbers based on your Indian/International campaign type.
          </div>
        </div>
      </button>

    </div>
  )
}
