import { ExternalLink, ShieldCheck } from 'lucide-react'

interface OfficialTranslationSourceBoxProps {
  sourceLabel: string
  title: string
  body: string
  uscisPolicyManualLabel: string
  ecfrLabel: string
  lastCheckedLabel: string
}

const lastCheckedDate = '2026-04-30'

export function OfficialTranslationSourceBox({
  sourceLabel,
  title,
  body,
  uscisPolicyManualLabel,
  ecfrLabel,
  lastCheckedLabel,
}: OfficialTranslationSourceBoxProps) {
  return (
    <aside className="rounded-card border border-brand-100 bg-brand-50 p-5 shadow-card">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
          <ShieldCheck className="h-5 w-5 text-brand-600" />
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">{sourceLabel}</p>
            <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">{body}</p>
          </div>

          <div className="space-y-2">
            <a
              href="https://www.uscis.gov/policy-manual/volume-1-part-e-chapter-6"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-2 text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
            >
              <span>{uscisPolicyManualLabel}</span>
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
            </a>
            <a
              href="https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-103/section-103.2"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-2 text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
            >
              <span>{ecfrLabel}</span>
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
            </a>
          </div>

          <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-600">
            {lastCheckedLabel.replace('{date}', lastCheckedDate)}
          </p>
        </div>
      </div>
    </aside>
  )
}
