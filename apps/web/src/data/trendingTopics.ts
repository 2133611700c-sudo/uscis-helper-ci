export interface TrendingTopic {
  id: string
  cardSlug: string
  isVerified: boolean
}

export const trendingTopics: TrendingTopic[] = [
  { id: 'reparole', cardSlug: 're-parole-u4u', isVerified: true },
  { id: 'tps-ukraine', cardSlug: 'tps-ukraine', isVerified: true },
  { id: 'ead-delays', cardSlug: 'ead-work-permit', isVerified: true },
  { id: 'payment-issues', cardSlug: 'payment-problem', isVerified: true },
  { id: 'i-94-issues', cardSlug: 'i-94', isVerified: true },
  { id: 'rfe-denial', cardSlug: 'rfe-denial', isVerified: true },
]
