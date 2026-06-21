// Copy to apps/web/data/painPoints/types.ts

export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Frequency = 'very_high' | 'high' | 'medium' | 'low'
export type Urgency = 'extreme' | 'critical' | 'high' | 'medium' | 'low'
export type Spread = 'very_high' | 'high' | 'medium' | 'low'
export type ReviewStatus = 'draft' | 'approved' | 'needs_update'
export type Locale = 'en' | 'ru' | 'uk' | 'es'

export interface PainPoint {
  id: string                          // 'reparole-ead-denied'
  rank: number                        // 1-35 priority order
  short_title: string
  description: string                 // user-facing, plain language
  severity: Severity
  frequency: Frequency
  urgency: Urgency
  service_card_slug: string           // matches serviceCards.ts slug
  evidence_count: number              // sum of likes/comments/views from research
  bad_advice_circulating: string[]    // false advice users hear
  product_solution: string            // what we're building to solve it
  primary_solution_form?: string      // 'I-131', 'I-765', etc.
  validated_sources: string[]         // 'FB UA Community 927 comments'
  last_verified: string               // ISO date
}

export interface Misinformation {
  id: string
  bad_claim: string                   // exact false claim circulating
  spread: Spread
  source_of_misinformation: string    // ChatGPT, outdated YouTube, etc.
  truth: string                       // correct interpretation
  truth_source_url: string            // Tier 1 official source
  truth_source_title: string
  risk_if_believed: string            // concrete consequence
  product_mitigation: string          // how site/product counters it
  service_pages_to_warn: string[]     // serviceCards slugs that should display warning
  last_verified: string
}

export interface FAQAnswer {
  id: string
  question: string                    // user-facing
  question_variants: string[]         // alternative phrasings (for fuzzy matching)
  language: Locale
  short_answer: string                // 1-2 sentences
  full_answer: string                 // 3-6 sentences max
  topic: string                       // 'reparole', 'tps', 'ead', etc.
  risk_level: Severity
  official_source_urls: string[]      // Tier 1 URLs
  related_pain_points: string[]       // pain point IDs
  related_misinformation: string[]    // misinformation IDs
  last_reviewed: string
  review_status: ReviewStatus
}
