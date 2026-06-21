import { describe, it, expect } from 'vitest'
import { brainHealth } from '../index'

// The engine-consensus `analyze()` pipeline was removed (Phase 2 quarantine —
// zero production callers). Only the health status export remains.
describe('central-brain health', () => {
  it('truthful — active core is docintel/canonical, engine inactive', () => {
    const h = brainHealth()
    expect(h.active_core).toMatch(/docintel/)
    expect(h.central_brain_engine).toBe('inactive')
    expect(h.migrated_claim_removed).toBe(true)
  })

  it('D-GLOSSARY catalog present with full provenance', () => {
    const h = brainHealth()
    expect(h.glossary.total).toBeGreaterThan(15)
    expect(h.glossary.provenance_complete).toBe(true) // every entry has a source_url
    expect(h.glossary.categories.length).toBeGreaterThan(5)
  })
})
