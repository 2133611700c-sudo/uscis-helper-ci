/**
 * visionExtractHonestDegradation.test.ts — P1 (2026-06-14).
 *
 * Guards (source-level, like visionExtract502) that the vision-extract route
 * FAILS CLOSED on a typed provider error instead of returning HTTP 200 + empty
 * fields, AND that the genuine success / honest-empty paths are preserved.
 *
 * Also asserts documentFieldReader attaches a typed provider_error to a failed
 * read with an HTTP signal, and that the TranslateWizard surfaces an honest
 * "temporarily unavailable" state rather than advancing as a success.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROUTE = fs.readFileSync(path.resolve(__dirname, '..', 'vision-extract', 'route.ts'), 'utf-8')
const READER = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', 'lib', 'docintel', 'documentFieldReader.ts'),
  'utf-8',
)
const WIZARD = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', 'components', 'services', 'translation', 'TranslateWizard.tsx'),
  'utf-8',
)
const SMOKE = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..', '.github', 'workflows', 'post-deploy-smoke.yml'),
  'utf-8',
)

describe('vision-extract route — honest degradation wiring', () => {
  it('collects per-page provider errors on the Core path', () => {
    expect(ROUTE).toMatch(/coreProviderErrors\.push\(r\.provider_error\)/)
  })

  it('fails closed: no candidates + a provider error → ocrUnavailableResponse (NOT fall-through to legacy)', () => {
    expect(ROUTE).toMatch(/allCandidates\.length === 0 && coreProviderErrors\.length > 0/)
    expect(ROUTE).toMatch(/return ocrUnavailableResponse\(/)
  })

  it('legacy path also fails closed on a typed provider error', () => {
    expect(ROUTE).toMatch(/legacyCandidates\.length === 0 && legacyProviderErrors\.length > 0/)
  })

  it('the honest response uses the class-derived HTTP status (429/503/502), never 200', () => {
    expect(ROUTE).toMatch(/httpStatusForOcrError\(err\.error_code\)/)
    // Body is the typed contract.
    expect(ROUTE).toMatch(/error_code:\s*err\.error_code/)
    expect(ROUTE).toMatch(/retryable:\s*err\.retryable/)
  })

  it('sets Retry-After only for retryable errors', () => {
    expect(ROUTE).toMatch(/err\.retryable && typeof err\.retry_after_seconds === 'number'/)
  })

  it('genuine success path (ok:core-b2, status 200) is preserved', () => {
    expect(ROUTE).toMatch(/status:\s*'ok:core-b2'/)
  })

  it('the terminal no-fields path (no provider error) still returns 200 (honest empty ≠ outage)', () => {
    // The final NextResponse still returns 200 — an empty read WITHOUT a provider
    // error is not an outage (covered by visionExtract502).
    const tail = ROUTE.slice(ROUTE.lastIndexOf('ocr_field_safety: ocrFieldSafety'))
    expect(tail).toMatch(/\}\s*,\s*\{\s*status:\s*200\s*\}\s*\)/)
  })
})

describe('documentFieldReader — typed provider_error on failed read', () => {
  it('classifies a provider failure with an HTTP signal into provider_error', () => {
    expect(READER).toMatch(/classifyProviderError\(/)
    expect(READER).toMatch(/provider_error:\s*providerError/)
  })

  it('only attaches provider_error when there IS an HTTP/timeout signal (config errors fall through unchanged)', () => {
    expect(READER).toMatch(/typeof read\.errorStatus === 'number' \|\| read\.errorTimeout === true/)
  })
})

describe('TranslateWizard — provider unavailable is not a success', () => {
  it('detects a typed OCR error / provider_unavailable and does NOT advance as a read', () => {
    expect(WIZARD).toMatch(/setOcrUnavailable\(true\)/)
    expect(WIZARD).toMatch(/errorCode.*startsWith\('OCR_'\)|startsWith\('OCR_'\)/)
  })
  it('offers a retry that re-runs processing', () => {
    expect(WIZARD).toMatch(/onClick=\{\(\) => \{ setOcrUnavailable\(false\); startProcessing\(\) \}\}/)
  })
})

describe('post-deploy smoke — no longer burns paid OCR', () => {
  it('does NOT POST a real synthetic document file to vision-extract', () => {
    expect(SMOKE).not.toMatch(/file=@test-fixtures\/synthetic-passport\.jpg/)
  })
  it('does a contract check expecting the typed 400 (missing file) instead', () => {
    expect(SMOKE).toMatch(/expected 400/)
    expect(SMOKE).toMatch(/NO paid OCR/i)
  })
})
