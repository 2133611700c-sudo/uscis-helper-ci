# Helper Functions Spec

Generate `apps/web/lib/painPoints.ts` with the functions below.

## Required functions

```typescript
import { painPoints, type PainPoint } from '@/data/painPoints'
import { misinformation, type Misinformation } from '@/data/misinformation'
import { faqAnswers, type FAQAnswer } from '@/data/faqAnswers'
import type { Locale } from '@/data/painPoints/types'

/**
 * Get all pain points associated with a service card slug.
 * Used on service pages to render "Common mistakes" section.
 */
export function getPainPointsForService(slug: string): PainPoint[] {
  return painPoints.filter(p => p.service_card_slug === slug)
}

/**
 * Get all misinformation entries that should warn on this service page.
 * Used to render warning banners on relevant pages.
 */
export function getMisinformationForService(slug: string): Misinformation[] {
  return misinformation.filter(m => m.service_pages_to_warn.includes(slug))
}

/**
 * Get all FAQ entries for a topic in a specific locale.
 * Used to render FAQ section per topic per language.
 */
export function getFaqsByTopic(topic: string, locale: Locale): FAQAnswer[] {
  return faqAnswers.filter(f => f.topic === topic && f.language === locale)
}

/**
 * Get a single pain point by ID.
 */
export function getPainPoint(id: string): PainPoint | undefined {
  return painPoints.find(p => p.id === id)
}

/**
 * Get a single misinformation entry by ID.
 */
export function getMisinformation(id: string): Misinformation | undefined {
  return misinformation.find(m => m.id === id)
}

/**
 * Get critical pain points across all services, sorted by rank.
 * Used on homepage "trending issues" section in Wave 1.5.
 */
export function getCriticalPainPoints(limit = 8): PainPoint[] {
  return painPoints
    .filter(p => p.severity === 'critical')
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
}

/**
 * Get high-spread misinformation across all topics.
 * Used to surface most-circulating false claims.
 */
export function getHighSpreadMisinformation(): Misinformation[] {
  return misinformation.filter(m => m.spread === 'very_high' || m.spread === 'high')
}

/**
 * Get FAQ entries related to a specific pain point ID.
 * Used to suggest deeper reading on service pages.
 */
export function getFaqsForPainPoint(painPointId: string, locale: Locale): FAQAnswer[] {
  return faqAnswers.filter(
    f => f.language === locale && f.related_pain_points.includes(painPointId)
  )
}

/**
 * Get full set of related content for a service slug + locale.
 * Convenience wrapper used on service pages.
 */
export function getServicePageContent(slug: string, locale: Locale): {
  painPoints: PainPoint[]
  misinformation: Misinformation[]
  faqs: FAQAnswer[]
} {
  const sps = getPainPointsForService(slug)
  const sms = getMisinformationForService(slug)
  // Find topic from any associated pain point or fall back to slug
  const topic = sps[0]?.id.split('-')[0] || slug
  const sfs = getFaqsByTopic(topic, locale)
  return { painPoints: sps, misinformation: sms, faqs: sfs }
}
```

## Test (manual verification after generation)

```bash
node -e "
const { getPainPointsForService, getMisinformationForService, getFaqsByTopic, getCriticalPainPoints } = require('./apps/web/lib/painPoints')
console.log('TPS pain points:', getPainPointsForService('tps-ukraine').length)
console.log('TPS misinfo:', getMisinformationForService('tps-ukraine').length)
console.log('Re-parole FAQs (EN):', getFaqsByTopic('re-parole', 'en').length)
console.log('Critical pain points (top 8):', getCriticalPainPoints().map(p => p.id))
"
```

Expected output:
- TPS pain points: 4 or more
- TPS misinfo: 2 or more
- Re-parole FAQs (EN): 3 or more
- 8 critical pain point IDs listed
