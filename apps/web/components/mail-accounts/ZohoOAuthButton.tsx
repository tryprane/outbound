'use client'

export function ZohoOAuthButton() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        padding: '20px',
        border: '2px dashed var(--border)',
        borderRadius: '12px',
        background: 'var(--bg-secondary)',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: 'rgba(37, 99, 235, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#93c5fd',
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        Z
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>Connect Zoho Free Mailbox</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Uses Zoho OAuth and Mail APIs for inbox sync, spam rescue, and replies without relying on IMAP.
        </div>
      </div>
      <button className="btn-primary" onClick={() => { window.location.href = '/api/mail-accounts/zoho/connect' }}>
        Connect Zoho API
      </button>
    </div>
  )
}
