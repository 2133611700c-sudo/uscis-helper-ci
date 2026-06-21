import { painPoints, type PainPoint } from '@/data/painPoints'
import { misinformation, type Misinformation } from '@/data/misinformation'
import { faqAnswers, type FAQAnswer } from '@/data/faqAnswers'
import type { Locale } from '@/data/painPoints/types'

export function getPainPointsForService(slug: string): PainPoint[] {
  return painPoints.filter((p) => p.service_card_slug === slug)
}

export function getMisinformationForService(slug: string): Misinformation[] {
  return misinformation.filter((m) => m.service_pages_to_warn.includes(slug))
}

export function getFaqsByTopic(topic: string, locale: Locale): FAQAnswer[] {
  return faqAnswers.filter((f) => f.topic === topic && f.language === locale)
}

export function getPainPoint(id: string): PainPoint | undefined {
  return painPoints.find((p) => p.id === id)
}

export function getMisinformation(id: string): Misinformation | undefined {
  return misinformation.find((m) => m.id === id)
}

export function getCriticalPainPoints(limit = 8): PainPoint[] {
  return painPoints
    .filter((p) => p.severity === 'critical')
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
}

export function getHighSpreadMisinformation(): Misinformation[] {
  return misinformation.filter((m) => m.spread === 'very_high' || m.spread === 'high')
}

export function getFaqsForPainPoint(painPointId: string, locale: Locale): FAQAnswer[] {
  return faqAnswers.filter((f) => f.language === locale && f.related_pain_points.includes(painPointId))
}

export function getServicePageContent(
  slug: string,
  locale: Locale,
): {
  painPoints: PainPoint[]
  misinformation: Misinformation[]
  faqs: FAQAnswer[]
} {
  const sps = getPainPointsForService(slug)
  const sms = getMisinformationForService(slug)
  const topic = sps[0]?.id.split('-')[0] || slug
  const sfs = getFaqsByTopic(topic, locale)
  return { painPoints: sps, misinformation: sms, faqs: sfs }
}
