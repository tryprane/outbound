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
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>Add Zoho API to the same mailbox</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          This does not create a second sender. If you connect the same email you saved with SMTP, the app upgrades that same mailbox with inbox sync, spam rescue, and reply actions through Zoho API.
        </div>
      </div>
      <button className="btn-primary" onClick={() => { window.location.href = '/api/mail-accounts/zoho/connect' }}>
        Connect Same Mailbox
      </button>
    </div>
  )
}
