'use client'

import { useWizard } from '@/contexts/WizardContext'

interface DesktopAssistantPanelProps {
  slug: string
}

const FAQ_QUESTIONS = [
  'What is Form I-131?',
  'What is Uniting for Ukraine (U4U)?',
  'Where do I find my A-Number?',
  'How do I get my I-94 record?',
  'How long does re-parole take?',
] as const

const USCIS_LINKS = [
  { label: 'USCIS.gov', href: 'https://www.uscis.gov/i-131' },
  { label: 'CBP I-94 Lookup', href: 'https://i94.cbp.dhs.gov/' },
  { label: 'USCIS Processing Times', href: 'https://egov.uscis.gov/processing-times/' },
  { label: 'USCIS Re-Parole Info', href: 'https://www.uscis.gov/humanitarian/uniting-for-ukraine/re-parole-process-for-ukrainians' },
] as const

/**
 * Right assistant panel — matches prototype Mia helper design.
 * Shows step context, FAQ questions, and official source links.
 */
export function DesktopAssistantPanel({ slug }: DesktopAssistantPanelProps) {
  const { state, setMiaOpen } = useWizard()

  const STEP_LABELS: Record<number, string> = {
    0: 'Welcome', 1: 'About the Form', 2: 'Package', 3: 'Family',
    4: 'Documents', 5: 'Recognition', 6: 'Confirm', 7: 'Info & Evidence',
    8: 'Filing Method', 9: 'Preview', 10: 'Payment', 11: 'Download', 12: 'Transfer',
  }

  return (
    <aside
      data-testid="desktop-assistant-panel"
      data-slug={slug}
      className="overflow-y-auto sticky top-[73px] h-[calc(100vh-73px)]"
      style={{
        background: 'var(--surface-2)',
        borderLeft: '1px solid var(--border)',
        padding: '20px',
      }}
    >
      {/* Mia header */}
      <div className="mb-4">
        <h3
          className="text-[15px] font-bold mb-1"
          style={{ color: 'var(--text-1)' }}
        >
          Assistant
        </h3>
        <p
          className="text-sm font-semibold uppercase tracking-wide mb-3"
          style={{ color: 'var(--text-3)', letterSpacing: '0.5px' }}
        >
          Step {state.step + 1} · {STEP_LABELS[state.step] ?? ''}
        </p>
        <button
          type="button"
          onClick={() => setMiaOpen(true)}
          className="w-full rounded-[8px] text-[14px] font-semibold transition-all active:scale-[0.98]"
          style={{
            background: 'var(--primary)',
            color: '#fff',
            border: 'none',
            padding: '11px 14px',
            minHeight: '44px',
          }}
        >
          Ask Mia →
        </button>
      </div>

      {/* FAQ chips */}
      <div className="mb-4">
        <p
          className="text-sm font-semibold uppercase tracking-wide mb-2"
          style={{ color: 'var(--text-3)', letterSpacing: '0.5px' }}
        >
          Common Questions
        </p>
        <div className="space-y-1.5">
          {FAQ_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setMiaOpen(true)}
              className="w-full text-left rounded-[10px] text-sm font-medium transition-all"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
                padding: '10px 12px',
                minHeight: '40px',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Official sources */}
      <div>
        <p
          className="text-sm font-semibold uppercase tracking-wide mb-2"
          style={{ color: 'var(--text-3)', letterSpacing: '0.5px' }}
        >
          Official Sources
        </p>
        <div className="space-y-1.5">
          {USCIS_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-[10px] text-sm font-medium transition-all no-underline"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
                padding: '10px 12px',
                minHeight: '40px',
              }}
            >
              <span>{link.label}</span>
              <span style={{ color: 'var(--text-3)' }}>↗</span>
            </a>
          ))}
        </div>
      </div>

      <p
        className="mt-4 text-sm leading-relaxed"
        style={{ color: 'var(--text-3)', paddingTop: '12px', borderTop: '1px solid var(--border)' }}
      >
        Information and document support only. Not legal advice.
      </p>
    </aside>
  )
}
