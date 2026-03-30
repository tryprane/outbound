'use client'

interface GmailOAuthButtonProps {
  onConnected?: () => void
}

export function GmailOAuthButton({ onConnected }: GmailOAuthButtonProps) {
  const handleConnect = () => {
    // Redirect to the Gmail OAuth route which redirects to Google
    window.location.href = '/api/mail-accounts/gmail'
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      padding: '20px',
      border: '2px dashed var(--border)',
      borderRadius: '12px',
      background: 'var(--bg-secondary)',
    }}>
      {/* Gmail Icon */}
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        background: 'rgba(234, 67, 53, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width="24" height="24" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
          Connect Gmail Account
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Grants <strong style={{ color: 'var(--text-secondary)' }}>gmail.send</strong> and <strong style={{ color: 'var(--text-secondary)' }}>gmail.modify</strong> so warmup sending and mailbox sync can both work
        </div>
      </div>

      <button
        onClick={handleConnect}
        style={{
          padding: '10px 20px',
          background: 'white',
          color: '#333',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'opacity 0.15s',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Connect with Google
      </button>
    </div>
  )
}
