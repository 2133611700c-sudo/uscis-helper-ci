/**
 * certifierUx.test.ts — source-level guard for the USCIS certifier step on the
 * wizard's signature screen (Screen 7). The repo's vitest env is `node` (no DOM),
 * so we assert the wiring is present in the source the same way the existing
 * wizard guard does. The behavioural logic is covered by reviewGate.test.ts.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'TranslateWizard.tsx'), 'utf-8')

describe('TranslateWizard — USCIS certifier step (Screen 7)', () => {
  it('declares certifier state (address + two attestation checkboxes)', () => {
    expect(SRC).toMatch(/const \[certifierAddress, setCertifierAddress\] = useState/)
    expect(SRC).toMatch(/const \[dataReviewed, setDataReviewed\] = useState/)
    expect(SRC).toMatch(/const \[accuracyAttested, setAccuracyAttested\] = useState/)
  })

  it('renders an address input and two checkboxes bound to that state', () => {
    expect(SRC).toMatch(/value=\{certifierAddress\}/)
    expect(SRC).toMatch(/checked=\{dataReviewed\}/)
    expect(SRC).toMatch(/checked=\{accuracyAttested\}/)
  })

  it('hard-gates the download button on signature + both checkboxes + address', () => {
    expect(SRC).toMatch(/disabled=\{pdfLoading \|\| hasUnresolvedReviewFields \|\| !sigSaved \|\| !dataReviewed \|\| !accuracyAttested \|\| !certifierAddress\.trim\(\)\}/)
  })

  it('also guards inside the download handler (defence in depth)', () => {
    expect(SRC).toMatch(/if \(hasUnresolvedReviewFields\) return/)
    expect(SRC).toMatch(/if \(!dataReviewed \|\| !accuracyAttested \|\| !certifierAddress\.trim\(\)\) return/)
  })

  it('blocks payment until OCR review-required fields are resolved', () => {
    expect(SRC).toMatch(/if \(paymentLoading \|\| !canProceedToCertifiedOutput\) return/)
    expect(SRC).toMatch(/disabled=\{paymentLoading \|\| !canProceedToCertifiedOutput\}/)
    expect(SRC).toMatch(/disabled=\{!canProceedToCertifiedOutput\}/)
  })

  it('lets the user explicitly confirm a flagged OCR value', () => {
    expect(SRC).toMatch(/const handleConfirmField = useCallback/)
    expect(SRC).toMatch(/review_required: false/)
    expect(SRC).toMatch(/s5_confirm:/)
  })

  it('sends the certifier fields + address to the API', () => {
    expect(SRC).toMatch(/dataReviewed,/)
    expect(SRC).toMatch(/accuracyAttested,/)
    expect(SRC).toMatch(/addr: certifierAddress\.trim\(\)/)
  })

  it('has the certifier i18n strings in both locales (ru + en)', () => {
    expect((SRC.match(/s7_check1:/g) || []).length).toBeGreaterThanOrEqual(2)
    expect((SRC.match(/s7_check2:/g) || []).length).toBeGreaterThanOrEqual(2)
    expect((SRC.match(/s7_addr_label:/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})
