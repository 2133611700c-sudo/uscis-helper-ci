/**
 * wizardScopeAndDeadCode.test.ts — replacement for the pre-2026-05-28 guard.
 *
 * The owner approved a redesigned translation wizard (prototype-driven 7-screen
 * navy/gold flow with doc-type tiles for booklet/passport/birth/marriage/ID/other).
 * Birth/marriage/divorce no longer "do not exist" — they are explicit doc-type
 * tiles that route to manual review (auto=false) at the same $14.99 tariff,
 * because the wizard now collects payment for human-assisted translation too.
 *
 * What we STILL enforce (the durable safety constraints, not the obsolete
 * structural shape of the old wizard):
 *
 *   1. Legacy dead-code surface still gone (TranslationWizard.tsx,
 *      TranslationServiceExperience.tsx, TranslationServicePanel.tsx).
 *   2. v5 §31 forbidden marketing claims must not appear in the wizard:
 *      "USCIS accepted", "USCIS-accepted", "certified by AI", "guaranteed
 *      acceptance", "will be accepted by USCIS", "принимается USCIS".
 *   3. Doc-types whose registry module is `status:'draft'` are declared
 *      auto:false in DOC_TYPES (so they route to manual review at the
 *      review screen rather than promising auto-PDF).
 *   4. Classifier still returns manual-review for the demoted modules.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { classifyToModule } from '../../../../lib/translation/modules/registry'

const TRANSLATION_DIR = path.resolve(__dirname, '..')
const ACTIVE_WIZARD = path.join(TRANSLATION_DIR, 'TranslateWizard.tsx')

describe('legacy dead-code surface', () => {
  for (const f of ['TranslationWizard.tsx', 'TranslationServiceExperience.tsx', 'TranslationServicePanel.tsx']) {
    it(`${f} must not exist`, () => {
      expect(fs.existsSync(path.join(TRANSLATION_DIR, f))).toBe(false)
    })
  }
})

describe('TranslateWizard — v5 §31 forbidden marketing claims', () => {
  const src = fs.readFileSync(ACTIVE_WIZARD, 'utf-8')
  const forbidden: Array<[string, RegExp]> = [
    ['USCIS-accepted',            /USCIS-accepted/i],
    ['USCIS accepted',            /\bUSCIS accepted\b/i],
    ['accepted by USCIS',         /\baccepted by USCIS\b/i],
    ['принимается USCIS',         /принимается USCIS/i],
    ['certified by AI',           /certified by AI/i],
    ['guaranteed acceptance',     /guaranteed acceptance/i],
    ['will be accepted by USCIS', /will be accepted by USCIS/i],
    ['approved translation',      /approved translation/i],
    ['instant certified',         /instant certified translation/i],
  ]
  for (const [label, re] of forbidden) {
    it(`does not contain forbidden phrase: ${label}`, () => {
      expect(src, `forbidden phrase '${label}' found`).not.toMatch(re)
    })
  }
})

describe('TranslateWizard — manual-review routing for demoted modules', () => {
  const src = fs.readFileSync(ACTIVE_WIZARD, 'utf-8')

  it("DOC_TYPES declares non-booklet doc types as auto:false (manual review)", () => {
    // Birth / marriage / other (and any registry doc whose module is draft)
    // must be auto:false so the wizard routes through the manual-review notice.
    // We pin a few critical entries.
    expect(src).toMatch(/id:\s*'birth'[\s\S]{0,200}auto:\s*false/)
    expect(src).toMatch(/id:\s*'marriage'[\s\S]{0,200}auto:\s*false/)
    expect(src).toMatch(/id:\s*'other'[\s\S]{0,200}auto:\s*false/)
    // The booklet is the only currently-validated auto path.
    expect(src).toMatch(/id:\s*'passport_internal'[\s\S]{0,300}auto:\s*true/)
  })
})

describe('classifyToModule self-serve eligibility (server-side truth)', () => {
  it('ua_internal_passport_booklet @ confidence 1.0 → active + auto-PDF', () => {
    const m = classifyToModule('ua_internal_passport_booklet', 1.0)
    expect(m.documentType).toBe('ua_internal_passport_booklet')
    expect(m.status).toBe('active')
    expect(m.reviewPolicy.allowAutoPdf).toBe(true)
  })
  it('ua_birth_certificate → manual review (demoted module)', () => {
    const m = classifyToModule('ua_birth_certificate', 1.0)
    expect(m.documentType).toBe('manual_review_required')
    expect(m.reviewPolicy.allowAutoPdf).toBe(false)
  })
  it('ua_marriage_certificate → manual review', () => {
    expect(classifyToModule('ua_marriage_certificate', 1.0).reviewPolicy.allowAutoPdf).toBe(false)
  })
  it('unknown documentType → manual review', () => {
    const m = classifyToModule('this_doc_does_not_exist', 1.0)
    expect(m.documentType).toBe('manual_review_required')
    expect(m.reviewPolicy.allowAutoPdf).toBe(false)
  })
  it('ua_internal_passport_booklet @ confidence 0.5 → manual review (low confidence)', () => {
    expect(classifyToModule('ua_internal_passport_booklet', 0.5).reviewPolicy.allowAutoPdf).toBe(false)
  })
})

// ── Client-side downscale before upload (GT bench finding A: >4MB → 413) ──────
describe('TranslateWizard — large photos are downscaled before vision-extract', () => {
  const src = fs.readFileSync(ACTIVE_WIZARD, 'utf-8')

  it('imports the shared upload-prep helper (not a local copy)', () => {
    expect(src).toContain("from '@/lib/upload/prepareImageForUpload'")
    expect(src).toContain('prepareImageForUpload')
  })

  it('prepares each image (free OSD rotate + per-file-budget downscale) before upload', () => {
    expect(src).toMatch(/prepareImageForUpload\(f,\s*\{/) // shared rotate+downscale helper
    expect(src).toMatch(/form\.append\('file', prepared\.blob, prepared\.name\)/)
    expect(src).toMatch(/perFileBudget/)                  // multi-photo body-cap budget
  })
})
