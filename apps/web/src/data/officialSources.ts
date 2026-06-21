export interface OfficialSource {
  id: string
  url: string
  sourceType: 'uscis' | 'cbp' | 'doj' | 'ecfr' | 'federal-register'
  lastCheckedAt: string
  status: 'verified' | 'needs-review'
}

export const featuredSources: OfficialSource[] = [
  { id: 'uscis-case-status', url: 'https://egov.uscis.gov/', sourceType: 'uscis', lastCheckedAt: '2026-04-29', status: 'verified' },
  { id: 'uscis-forms', url: 'https://www.uscis.gov/forms', sourceType: 'uscis', lastCheckedAt: '2026-04-29', status: 'verified' },
  { id: 'cbp-i94', url: 'https://i94.cbp.dhs.gov/', sourceType: 'cbp', lastCheckedAt: '2026-04-29', status: 'verified' },
  { id: 'doj-accredited', url: 'https://www.justice.gov/eoir/recognized-organizations-and-accredited-representatives-roster', sourceType: 'doj', lastCheckedAt: '2026-04-29', status: 'verified' },
]
