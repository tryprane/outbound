'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    setLoading(true)
    await signIn('google', { callbackUrl: '/' })
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'fixed',
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}/>

      <div className="glass-card animate-fade-in" style={{ padding: '48px 40px', maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        {/* Logo */}
        <div style={{
          width: '64px',
          height: '64px',
          background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
          borderRadius: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          margin: '0 auto 24px',
          boxShadow: '0 8px 32px rgba(99,102,241,0.3)',
        }}>⚡</div>

        <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
          OutreachOS
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '36px', lineHeight: 1.6 }}>
          Internal outbound automation platform.<br/>Sign in to access your campaigns.
        </p>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px 20px',
            background: loading ? 'var(--bg-hover)' : 'white',
            color: '#333',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            transition: 'all 0.2s',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {!loading ? (
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          ) : (
            <div style={{
              width: '20px', height: '20px', border: '2px solid #ccc',
              borderTopColor: '#666', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }}/>
          )}
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>

        <p style={{ marginTop: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
          For internal agency use only
        </p>
      </div>
    </div>
  )
}
