import { registryCatalog } from '@uscis-helper/knowledge'

/**
 * Truthful runtime status for /api/central-brain/health.
 *
 * REALITY (verified 2026-06-12): the production document pipeline is
 * `docintel` + `canonical/core` (arbitration), reached from the four extract
 * routes. The `central-brain/engine` module — `analyze()` / engine consensus —
 * has NO production callers; it is inactive.
 *
 * This endpoint previously claimed `migrated: true / "full pipeline through
 * engine consensus"`. That was inaccurate (the engine never runs on a real
 * request) and is removed. Do not reintroduce migration claims here.
 */
export function brainHealth() {
  const glossary = registryCatalog()
  return {
    ok: true,
    active_core: 'docintel + canonical/core (arbitration)',
    central_brain_engine: 'inactive', // engine analyze() has no production callers
    legacy_paths_present: true, // tps modules still run for US-form slots and as fallback
    migrated_claim_removed: true,
    products: {
      translation: 'docintel/canonical via /api/translation/vision-extract',
      reparole_u4u: 'docintel/canonical via /api/reparole/ocr/extract',
      ead: 'docintel/canonical via /api/ead/ocr/extract',
      tps: 'tps modules (+ docintel/canonical fallback) via /api/tps/ocr/extract',
    },
    // D-GLOSSARY self-description — the knowledge registry the active core consults.
    glossary: {
      categories: glossary,
      total: glossary.reduce((a, c) => a + c.count, 0),
      provenance_complete: glossary.every((c) => c.withSource === c.count),
    },
  }
}
