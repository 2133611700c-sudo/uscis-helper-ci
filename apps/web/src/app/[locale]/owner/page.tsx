'use client'

import { useState, useEffect } from 'react'

type Step = 'check' | 'email' | 'code' | 'active'

export default function OwnerPage() {
  const [step, setStep] = useState<Step>('check')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/owner/status')
      .then(r => r.json())
      .then(d => { if (d.owner) setStep('active'); else setStep('email') })
      .catch(() => setStep('email'))
  }, [])

  const requestCode = async () => {
    if (!email.includes('@')) { setMsg('Enter valid email'); return }
    setLoading(true); setMsg('')
    try {
      const r = await fetch('/api/owner/request-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const d = await r.json()
      setMsg(d.message || d.error || 'Sent')
      setStep('code')
    } catch { setMsg('Network error') }
    setLoading(false)
  }

  const verifyCode = async () => {
    if (code.length !== 6) { setMsg('Enter 6-digit code'); return }
    setLoading(true); setMsg('')
    try {
      const r = await fetch('/api/owner/verify-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const d = await r.json()
      if (d.ok) { setStep('active'); setMsg('') }
      else setMsg(d.error || 'Invalid code')
    } catch { setMsg('Network error') }
    setLoading(false)
  }

  const logout = async () => {
    await fetch('/api/owner/logout', { method: 'POST' })
    setStep('email'); setMsg('Session cleared')
  }

  // All colors use CSS variables for dark mode support
  const s: React.CSSProperties = {
    maxWidth: 400, margin: '80px auto', padding: 24,
    fontFamily: 'system-ui, sans-serif', color: 'var(--text-1)',
  }
  const input: React.CSSProperties = {
    width: '100%', padding: '12px 16px', fontSize: 18,
    border: '2px solid var(--border)', borderRadius: 8, marginBottom: 12,
    boxSizing: 'border-box', background: 'var(--surface-1)', color: 'var(--text-1)',
  }
  const btn: React.CSSProperties = {
    width: '100%', padding: '14px', fontSize: 16, fontWeight: 600,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    backgroundColor: 'var(--accent, #10a37f)', color: '#fff',
  }

  if (step === 'check') return <div style={s}><p>Checking...</p></div>

  if (step === 'active') return (
    <div style={s}>
      <h2 style={{ color: 'var(--success, #16a34a)' }}>✓ Owner Access Active</h2>
      <p>All services are free for 24 hours.</p>
      <p>This works on this device and browser.</p>
      <button style={{ ...btn, backgroundColor: 'var(--surface-3)', marginTop: 20 }} onClick={logout}>
        Logout
      </button>
    </div>
  )

  return (
    <div style={s}>
      <h2 style={{ color: 'var(--text-1)' }}>Owner Access</h2>
      {step === 'email' && (
        <>
          <input style={input} type="email" placeholder="Owner email"
            value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && requestCode()}
            autoComplete="email" autoFocus />
          <button style={btn} onClick={requestCode} disabled={loading}>
            {loading ? 'Sending...' : 'Send Code'}
          </button>
        </>
      )}
      {step === 'code' && (
        <>
          <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Code sent to your email</p>
          <input style={{ ...input, fontSize: 24, textAlign: 'center', letterSpacing: 8 }}
            type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            placeholder="000000" value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && verifyCode()}
            autoFocus />
          <button style={btn} onClick={verifyCode} disabled={loading}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
          <button style={{ ...btn, backgroundColor: 'transparent', color: 'var(--text-3)', marginTop: 8 }}
            onClick={() => setStep('email')}>
            Back
          </button>
        </>
      )}
      {msg && <p style={{ marginTop: 12, color: msg.includes('error') || msg.includes('Invalid') ? 'var(--error-text, #dc2626)' : 'var(--text-2)' }}>{msg}</p>}
    </div>
  )
}
