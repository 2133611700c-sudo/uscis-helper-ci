/**
 * canonicalCarriage.test.ts — source-level guard for end-to-end
 * canonical_document_id carriage in the translation wizard.
 *
 * Contract (CANONICAL_CONTINUITY):
 *   1. CAPTURE: after the vision-extract response arrives, the wizard reads
 *      response.canonical_document_id and stores it in wizard state. A non-string
 *      / absent value (shadow persist failure or continuity=off) stores null —
 *      never a fabricated id.
 *   2. CARRY: the id is persisted in the session draft and restored on the Stripe
 *      return (?paid=1), because generate-pdf runs on the post-payment screen.
 *   3. RESEND: the generate-pdf request body includes canonical_document_id ONLY
 *      when one was captured (key omitted otherwise → stays optional, shadow-safe).
 *
 * Mirrors the source-level style of sessionIsolation.test.ts / hardCaseAutoread.test.ts
 * (this wizard has no React-render harness; the tests assert on the source).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'TranslateWizard.tsx'), 'utf-8')

describe('TranslateWizard — canonical_document_id carriage', () => {
  it('declares canonicalDocumentId wizard state', () => {
    expect(SRC).toMatch(/const \[canonicalDocumentId, setCanonicalDocumentId\] = useState<string \| null>\(null\)/)
  })

  it('CAPTURE: reads canonical_document_id from the extract response and stores only a non-empty string (else null)', () => {
    // captures from the parsed extract json
    expect(SRC).toMatch(/const capturedId = \(json as \{ canonical_document_id\?: string \| null \}\)\.canonical_document_id/)
    // stores the string only when it is a non-empty string, otherwise null — no fabrication
    expect(SRC).toMatch(/setCanonicalDocumentId\(typeof capturedId === 'string' && capturedId\.length > 0 \? capturedId : null\)/)
  })

  it('CAPTURE: clears any prior id at the start of a new read', () => {
    expect(SRC).toMatch(/setExtractedFields\(\[\]\)[\s\S]{0,160}setCanonicalDocumentId\(null\)/)
  })

  it('CARRY: persists the id in the session draft', () => {
    expect(SRC).toMatch(/canonicalDocumentId\?: string \| null/) // DraftState field
    // The draft object still carries canonicalDocumentId (PII-containment added a
    // sanitized extractedFields + savedAt; the carriage key is unchanged).
    expect(SRC).toMatch(/const draft: DraftState = \{[\s\S]{0,260}\bcanonicalDocumentId,?[\s\S]{0,120}\}/)
  })

  it('CARRY: restores the id on the Stripe return, accepting only a non-empty string', () => {
    expect(SRC).toMatch(/if \(typeof draft\.canonicalDocumentId === 'string' && draft\.canonicalDocumentId\.length > 0\) \{[\s\S]{0,80}setCanonicalDocumentId\(draft\.canonicalDocumentId\)/)
  })

  it('RESEND: includes canonical_document_id in the generate-pdf body ONLY when captured (omitted otherwise)', () => {
    // the spread guarantees the key is absent when no id was captured (shadow-safe / optional)
    expect(SRC).toMatch(/\.\.\.\(canonicalDocumentId \? \{ canonical_document_id: canonicalDocumentId \} : \{\}\)/)
    // and it lives inside the generate-pdf POST body
    const genPdfIdx = SRC.indexOf("fetch('/api/translation/generate-pdf'")
    expect(genPdfIdx).toBeGreaterThan(-1)
    const bodySlice = SRC.slice(genPdfIdx, genPdfIdx + 1400)
    expect(bodySlice).toMatch(/canonical_document_id: canonicalDocumentId/)
  })

  it('SAFETY: never sends a hardcoded/fabricated id', () => {
    // no literal string assigned as a canonical_document_id value anywhere in the wizard
    expect(SRC).not.toMatch(/canonical_document_id:\s*['"]/)
  })
})
