'use client'

import { useState } from 'react'
import { getGlossaryDef } from './GlossaryProvider'

interface GlossaryTooltipProps {
  term: string
  /** BCP-47 locale — 'uk' | 'ru' | 'en' | 'es'. Defaults to 'en'. */
  locale?: string
  children: React.ReactNode
}

/**
 * Wraps `children` with a dotted underline and shows the glossary definition
 * on hover (desktop) or tap (mobile) in the wizard locale.
 */
export function GlossaryTooltip({ term, locale = 'en', children }: GlossaryTooltipProps) {
  const definition = getGlossaryDef(term, locale)
  const [visible, setVisible] = useState(false)

  if (!definition) {
    // No glossary entry — render children as-is
    return <>{children}</>
  }

  return (
    <span className="relative inline-block">
      {/* Trigger */}
      <span
        role="button"
        tabIndex={0}
        aria-label={`${term}: ${definition}`}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onClick={() => setVisible((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setVisible((v) => !v)
          }
          if (e.key === 'Escape') setVisible(false)
        }}
        style={{
          borderBottom: '1.5px dashed var(--primary)',
          cursor: 'help',
          color: 'inherit',
        }}
        className="focus:outline-none"
      >
        {children}
      </span>

      {/* Tooltip bubble */}
      {visible && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[70] w-64 max-w-[calc(100vw-2rem)]"
          style={{
            background: 'var(--text-1)',
            color: 'var(--surface)',
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '15px',
            lineHeight: '1.5',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          }}
        >
          <span
            style={{ display: 'block', fontWeight: 700, fontSize: '15px', marginBottom: '4px', opacity: 0.7 }}
          >
            {term}
          </span>
          {definition}
          {/* Arrow */}
          <span
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: `6px solid var(--text-1)`,
            }}
          />
        </span>
      )}
    </span>
  )
}
