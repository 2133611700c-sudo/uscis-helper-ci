'use client'
// global-error.tsx — catches errors that bubble past all other error.tsx files
// Rendered with a minimal shell (no layout providers) so must be self-contained.

import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#f1f5f9',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 480, padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
            An unexpected error occurred. Our team has been notified and will fix
            it shortly.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '1.5rem' }}>
              Error ID: {error.digest}
            </p>
          )}
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '0.625rem 1.25rem',
              background: '#3b82f6',
              color: '#fff',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            ← Back to home
          </a>
        </div>
        {/* Render Next.js error component to preserve digest / status code */}
        <div style={{ display: 'none' }}>
          <NextError statusCode={0} />
        </div>
      </body>
    </html>
  )
}
