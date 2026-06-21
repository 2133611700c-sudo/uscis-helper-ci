/**
 * /[locale]/services/translate-document/session/[sessionId]/review
 *
 * Evidence Review Page — Messenginfo v5.0
 *
 * UX requirements:
 *   - 18px minimum body text
 *   - 44px minimum tap targets
 *   - Non-technical language (no JSON, no "confidence score")
 *   - Target users 35–80 years old, non-lawyers
 *   - Blocks certification until all critical fields are confirmed
 *   - Shows document image alongside each field for evidence
 *
 * Components (all inline, single file):
 *   ReviewProgress, EvidenceFieldCard, SourceCropViewer,
 *   ConfirmFieldButton, CorrectFieldModal, CertificationForm,
 *   PaymentGateStatus, FinalDownloadPanel
 */

import type { Metadata } from 'next'
import { Suspense } from 'react'
import { EvidenceReviewPage } from './EvidenceReviewPage'

interface Props {
  params: Promise<{ locale: string; sessionId: string }>
  searchParams: Promise<{ run_id?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const titles: Record<string, string> = {
    uk: 'Перевірте переклад — Messenginfo',
    en: 'Review Your Translation — Messenginfo',
    es: 'Revise su traducción — Messenginfo',
    ru: 'Проверьте перевод — Messenginfo',
  }
  return {
    title: titles[locale] ?? titles.en,
    robots: { index: false, follow: false },
  }
}

export default async function ReviewPage({ params, searchParams }: Props) {
  const { locale, sessionId } = await params
  const { run_id } = await searchParams
  return (
    <Suspense fallback={<LoadingScreen />}>
      <EvidenceReviewPage sessionId={sessionId} locale={locale} initialRunId={run_id} />
    </Suspense>
  )
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      background: 'var(--background)',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '4px solid #e5e7eb',
        borderTopColor: '#2563eb',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ fontSize: '18px', color: '#6b7280' }}>Loading your translation…</p>
    </div>
  )
}
