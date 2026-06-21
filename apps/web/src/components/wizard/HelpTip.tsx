'use client'

/**
 * HelpTip — compact inline help tooltip.
 *
 * Renders a small "?" chip next to a field label.
 * Clicking it expands a contextual tip below the label (inline, no modal).
 *
 * Usage:
 *   <HelpTip id="i94-help" content="Your I-94 is a…" />
 */

import { useState } from 'react'

interface HelpTipProps {
  /** Unique id used for aria-controls */
  id: string
  /** The help text to show when expanded */
  content: string
  /** Optional additional className for the wrapper span */
  className?: string
}

export function HelpTip({ id, content, className = '' }: HelpTipProps) {
  const [open, setOpen] = useState(false)

  return (
    <span className={`inline-flex flex-col gap-1 align-top ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-full text-sm font-bold leading-none transition-all"
        style={{
          width: '18px',
          height: '18px',
          background: open ? 'var(--primary)' : 'var(--surface-2)',
          border: `1.5px solid ${open ? 'var(--primary)' : 'var(--border-strong)'}`,
          color: open ? '#fff' : 'var(--text-3)',
          flexShrink: 0,
          cursor: 'pointer',
          verticalAlign: 'middle',
          marginLeft: '5px',
          marginBottom: '1px',
        }}
        aria-label="Show help"
      >
        ?
      </button>

      {open && (
        <span
          id={id}
          role="note"
          className="block rounded-[10px] text-sm leading-relaxed"
          style={{
            background: 'var(--info-bg, #eff6ff)',
            border: '1px solid var(--info-border, #bfdbfe)',
            color: 'var(--info-text, #1e40af)',
            padding: '9px 12px',
            marginTop: '2px',
          }}
        >
          {content}
        </span>
      )}
    </span>
  )
}
