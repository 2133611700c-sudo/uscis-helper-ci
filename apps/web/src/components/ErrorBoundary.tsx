'use client'
/**
 * ErrorBoundary — wraps any risky client subtree
 *
 * Usage:
 *   <ErrorBoundary fallback={<p>Failed to load</p>}>
 *     <MyComponent />
 *   </ErrorBoundary>
 *
 * Falls back to a minimal UI and reports the error to Sentry.
 */

import * as Sentry from '@sentry/nextjs'
import React, { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  /** Custom fallback. Receives the error so you can show a message. */
  fallback?: ReactNode | ((error: Error) => ReactNode)
  /** Optional label shown in Sentry for quick triage */
  label?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.withScope((scope) => {
      if (this.props.label) {
        scope.setTag('boundary', this.props.label)
      }
      scope.setExtra('componentStack', info.componentStack)
      Sentry.captureException(error)
    })
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback(this.state.error)
          : this.props.fallback
      }
      // Default minimal fallback
      return (
        <div
          style={{
            padding: '1rem',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: '0.5rem',
            color: 'var(--text-2, #64748b)',
            fontSize: '0.875rem',
            textAlign: 'center',
          }}
        >
          <span>⚠️ This section failed to load.</span>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginLeft: '0.5rem',
              textDecoration: 'underline',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
