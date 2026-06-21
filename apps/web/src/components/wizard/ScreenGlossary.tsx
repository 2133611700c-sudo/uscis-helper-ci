'use client'

import { useState } from 'react'
import { getGlossaryDef } from './GlossaryProvider'

interface ScreenGlossaryProps {
  terms: string[]
  locale: string
}

const LABELS: Record<string, string> = {
  uk: 'Терміни на цьому кроці',
  ru: 'Термины на этом шаге',
  en: 'Terms on this step',
  es: 'Términos en este paso',
}

/**
 * Renders a compact expandable glossary bar at the bottom of a wizard screen.
 * Each term is a tappable chip — tap expands to show the definition.
 * Mobile-friendly alternative to inline underline tooltips.
 */
export function ScreenGlossary({ terms, locale }: ScreenGlossaryProps) {
  const [openTerm, setOpenTerm] = useState<string | null>(null)

  const validTerms = terms.filter((t) => getGlossaryDef(t, locale) !== undefined)
  if (validTerms.length === 0) return null

  const label = LABELS[locale] ?? LABELS.en

  return (
    <div
      className="rounded-[12px] p-3"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <p className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>
        💬 {label}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {validTerms.map((term) => {
          const isOpen = openTerm === term
          return (
            <button
              key={term}
              type="button"
              onClick={() => setOpenTerm(isOpen ? null : term)}
              className="rounded-full text-sm font-semibold px-2.5 py-1 transition-all"
              style={{
                background: isOpen ? 'var(--primary)' : 'var(--surface)',
                color: isOpen ? '#fff' : 'var(--text-2)',
                border: `1.5px solid ${isOpen ? 'var(--primary)' : 'var(--border-strong)'}`,
              }}
            >
              {term} {isOpen ? '▲' : '?'}
            </button>
          )
        })}
      </div>

      {openTerm && (
        <div
          className="mt-2.5 rounded-[8px] p-3 text-sm leading-relaxed"
          style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)', color: 'var(--info-text)' }}
        >
          <span className="font-bold">{openTerm}:</span>{' '}
          {getGlossaryDef(openTerm, locale)}
        </div>
      )}
    </div>
  )
}
