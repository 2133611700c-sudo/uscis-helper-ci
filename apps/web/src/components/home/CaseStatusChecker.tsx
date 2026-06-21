'use client'

import { useTranslations } from 'next-intl'

// Messenginfo does NOT process USCIS case status data. This widget is a
// navigational link only — no input, no form, no submission. The user clicks
// the button and lands on the official USCIS Case Status Online portal.
const USCIS_CASE_STATUS_URL = 'https://egov.uscis.gov/'

export function CaseStatusChecker() {
  const t = useTranslations('caseStatus')

  return (
    <section
      className="mt-8 rounded-card bg-white border border-slate-200 p-5 md:p-6 shadow-card"
      aria-labelledby="case-status-heading"
    >
      <h2 id="case-status-heading" className="text-lg font-semibold text-ink-900 mb-1">
        {t('title')}
      </h2>
      <p className="text-sm text-ink-600 mb-4">{t('subtitle')}</p>
      <a
        href={USCIS_CASE_STATUS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-base font-medium px-5 py-2.5 rounded-btn transition-colors"
      >
        {t('buttonLabel')} ↗
      </a>
      <p className="mt-3 text-sm text-ink-600">{t('disclaimer')}</p>
    </section>
  )
}
