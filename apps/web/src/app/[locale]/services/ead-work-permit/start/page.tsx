/**
 * /[locale]/services/ead-work-permit/start
 *
 * Stage-11A: EAD Work Permit (I-765) wizard entry point.
 *
 * REGULATORY COPY VERIFIED 2026-05-06:
 *   - Form I-765, verify current edition at uscis.gov/i-765 before filing
 *   - Category (c)(11): parolee — humanitarian/public-benefit parole (U4U re-parole)
 *   - Category (c)(8): pending asylum applicant (I-589 filed, 180+ days pending)
 *   - Category (a)(12): TPS recipient
 *   - 540-day automatic extension: file before card expires
 *   - DO NOT file (c)(11) before I-131 re-parole approval letter in hand
 *   - Fees: never hardcoded — always uscis.gov/feecalculator
 *   - Source: uscis.gov/i-765 (verified 2026-05-06)
 *
 * Renders the self-contained EADWizard client component.
 * No Stripe. No USCIS submission. Not legal advice.
 * User downloads HTML packet, reviews, signs, and files themselves.
 */

import type { Metadata } from 'next'
import { EADWizard } from '@/components/services/ead/EADWizard'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params

  const titles: Record<string, string> = {
    en: 'EAD Work Permit (I-765) — Start Your Application',
    uk: 'Дозвіл на роботу EAD (I-765) — Почати заявку',
    ru: 'Разрешение на работу EAD (I-765) — Начать заявку',
    es: 'Permiso de Trabajo EAD (I-765) — Comenzar Solicitud',
  }
  const descriptions: Record<string, string> = {
    en: 'Self-help wizard to prepare your Form I-765 Employment Authorization Document packet. You review, sign, and file yourself with USCIS. Not legal advice.',
    uk: 'Самостійний помічник для підготовки пакету документів I-765. Ви перевіряєте, підписуєте та подаєте самостійно до USCIS. Не юридична порада.',
    ru: 'Помощник для самостоятельной подготовки пакета документов I-765. Вы проверяете, подписываете и подаёте сами в USCIS. Не юридическая консультация.',
    es: 'Asistente para preparar su paquete del Formulario I-765. Usted revisa, firma y presenta por su cuenta ante USCIS. No es asesoramiento legal.',
  }

  return {
    title: titles[locale] ?? titles.en,
    description: descriptions[locale] ?? descriptions.en,
    metadataBase: new URL('https://messenginfo.com'),
    robots: { index: false, follow: false },
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/ead-work-permit/start`,
    },
  }
}

export default async function EADStartPage({ params }: Props) {
  const { locale } = await params

  return <EADWizard locale={locale} />
}
