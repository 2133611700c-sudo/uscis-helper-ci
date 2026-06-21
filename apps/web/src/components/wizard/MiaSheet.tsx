'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Send } from 'lucide-react'
import { useWizard } from '@/contexts/WizardContext'

// ---------------------------------------------------------------------------
// API call to real Mia backend
// ---------------------------------------------------------------------------

interface MiaChatResponse {
  answer: string
  disclaimer: string
}

async function callMiaApi(
  message: string,
  locale: string,
  serviceSlug: string,
): Promise<{ answer: string; disclaimer: string; unavailable?: boolean }> {
  try {
    const res = await fetch('/api/mia/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, locale, serviceSlug }),
    })

    if (res.status === 503) {
      return {
        answer: '',
        disclaimer: '',
        unavailable: true,
      }
    }

    if (!res.ok) {
      return {
        answer: 'Something went wrong. Please try again.',
        disclaimer: 'Information only. Not legal advice.',
      }
    }

    const data = await res.json() as MiaChatResponse
    return {
      answer: data.answer ?? '',
      disclaimer: data.disclaimer ?? 'Information only. Not legal advice.',
    }
  } catch {
    return {
      answer: '',
      disclaimer: '',
      unavailable: true,
    }
  }
}

// ---------------------------------------------------------------------------
// Chat bubble
// ---------------------------------------------------------------------------

interface BubbleProps {
  role: 'user' | 'assistant'
  content: string
  disclaimer?: string
}

function Bubble({ role, content, disclaimer }: BubbleProps) {
  const isUser = role === 'user'

  // Render simple markdown-style bold (**text**)
  const parts = content.split(/\*\*(.+?)\*\*/g)
  const rendered = parts.map((p, i) =>
    i % 2 === 1 ? <strong key={i}>{p}</strong> : p,
  )

  return (
    <div className={['flex w-full flex-col', isUser ? 'items-end' : 'items-start'].join(' ')}>
      <div className={['flex w-full', isUser ? 'justify-end' : 'justify-start'].join(' ')}>
        {!isUser && (
          <span
            aria-hidden="true"
            className="mr-2 mt-1 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-base select-none"
            style={{ background: 'var(--surface-3)' }}
          >
            🤝
          </span>
        )}
        <div
          className="max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed"
          style={
            isUser
              ? { background: 'var(--accent)', color: '#fff', borderBottomRightRadius: '4px' }
              : { background: 'var(--surface-3)', color: 'var(--text-1)', borderBottomLeftRadius: '4px' }
          }
        >
          {rendered}
        </div>
      </div>
      {disclaimer && !isUser && (
        <p className="mt-1 ml-9 text-xs italic" style={{ color: 'var(--text-3)' }}>{disclaimer}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MiaSheet
// ---------------------------------------------------------------------------

export function MiaSheet() {
  const { state, setMiaOpen, addMiaMessage } = useWizard()
  const { miaOpen, miaMessages, locale, serviceSlug } = state

  const [inputValue, setInputValue] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom on new messages or thinking state change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [miaMessages, isThinking])

  // Focus input when sheet opens
  useEffect(() => {
    if (miaOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [miaOpen])

  async function handleSend() {
    const text = inputValue.trim()
    if (!text || isThinking) return

    setInputValue('')
    setUnavailable(false)
    addMiaMessage({ role: 'user', content: text })

    setIsThinking(true)

    const result = await callMiaApi(text, locale, serviceSlug)

    setIsThinking(false)

    if (result.unavailable) {
      setUnavailable(true)
      return
    }

    if (result.answer) {
      addMiaMessage({ role: 'assistant', content: result.answer })
      if (result.disclaimer) {
        setLastDisclaimer(result.disclaimer)
      }
    }
  }

  const [lastDisclaimer, setLastDisclaimer] = useState<string>('')

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  if (!miaOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[65] bg-black/40 backdrop-blur-sm"
        onClick={() => setMiaOpen(false)}
      />

      {/* Sheet / Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mia assistant"
        className={[
          // Mobile: full-height sheet from bottom
          'fixed inset-x-0 bottom-0 z-[70]',
          'flex flex-col',
          'rounded-t-2xl shadow-2xl',
          'h-[92dvh]',
          // Desktop: centered modal
          'sm:inset-auto sm:top-1/2 sm:left-1/2',
          'sm:-translate-x-1/2 sm:-translate-y-1/2',
          'sm:w-[480px] sm:h-[600px] sm:rounded-2xl',
        ].join(' ')}
        style={{ background: 'var(--surface-1)', color: 'var(--text-1)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-xl">🤝</span>
            <span className="font-semibold text-base" style={{ color: 'var(--text-1)' }}>Mia</span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setMiaOpen(false)}
            className="p-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ color: 'var(--text-3)', background: 'transparent' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0">
          {miaMessages.length === 0 && (
            <div className="text-center text-sm mt-8 space-y-2" style={{ color: 'var(--text-2)' }}>
              <p aria-hidden="true" className="text-2xl">👋</p>
              <p className="font-medium" style={{ color: 'var(--text-1)' }}>Hi, I&apos;m Mia!</p>
              <p>
                I can answer questions about the Re-Parole U4U process. What would you
                like to know?
              </p>
            </div>
          )}

          {miaMessages.map((msg, idx) => {
            // Show disclaimer only on the last assistant message
            const isLastAssistant =
              msg.role === 'assistant' && idx === miaMessages.length - 1
            return (
              <Bubble
                key={msg.ts}
                role={msg.role}
                content={msg.content}
                disclaimer={isLastAssistant ? lastDisclaimer : undefined}
              />
            )
          })}

          {isThinking && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-3)' }}>
              <span
                aria-hidden="true"
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-base"
                style={{ background: 'var(--surface-3)' }}
              >
                🤝
              </span>
              <span className="italic">Mia is thinking…</span>
              <span aria-hidden="true" className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: 'var(--text-3)', animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
            </div>
          )}

          {unavailable && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                background: 'var(--warning-bg)',
                border: '1px solid var(--warning-border, var(--border))',
                color: 'var(--warning-text)',
              }}
            >
              AI assistant is temporarily unavailable. You can still use the service checklist.
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div
          className="flex-shrink-0 px-3 py-3 flex gap-2 items-center"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about Re-Parole U4U…"
            disabled={isThinking}
            className={[
              'flex-1 rounded-xl px-4 py-2.5 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent',
              'disabled:opacity-50',
              'transition-colors',
            ].join(' ')}
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text-1)',
              border: '1px solid var(--border)',
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!inputValue.trim() || isThinking}
            aria-label="Send"
            className={[
              'flex-shrink-0 flex items-center justify-center',
              'w-10 h-10 rounded-xl',
              'text-white',
              'hover:opacity-90 active:scale-95',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-all duration-150',
            ].join(' ')}
            style={{ background: 'var(--accent)' }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {/* Disclaimer */}
        <p className="flex-shrink-0 text-center text-xs pb-2" style={{ color: 'var(--text-3)' }}>
          Information only. Not legal advice.
        </p>
      </div>
    </>
  )
}
