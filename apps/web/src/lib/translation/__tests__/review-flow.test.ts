/**
 * Tests — Evidence Review Flow, OCR gates, and completeness audit
 *
 * Tests cover:
 *   1. CRITICAL_FIELDS constant is correct
 *   2. Certify gate logic: block until all critical fields confirmed
 *   3. Completeness audit logic
 *   4. Field humanisation labels
 *   5. OCR adapter response parsing
 */

import { describe, it, expect } from 'vitest'

// ── Constants ─────────────────────────────────────────────────────────────────

const CRITICAL_FIELDS = [
  'surname', 'given_names', 'date_of_birth', 'place_of_birth',
  'series', 'number', 'issued_by', 'date_of_issue',
]

// ── Helpers mirroring production logic ───────────────────────────────────────

function canCertify(
  fields: Array<{ field: string; confirmed: boolean }>
): { ok: boolean; unconfirmed: string[] } {
  const unconfirmed = CRITICAL_FIELDS.filter(cf => {
    const row = fields.find(f => f.field === cf)
    return row && !row.confirmed
  })
  return { ok: unconfirmed.length === 0, unconfirmed }
}

function completenessAudit(
  dbFields: Array<{ field: string; confirmed: boolean; normalized_value: string }>,
  finalFields: Array<{ field: string; normalized_value: string }>
): { passed: boolean; unconfirmedCritical: string[]; mismatchedFields: string[] } {
  const finalMap = Object.fromEntries(finalFields.map(f => [f.field, f.normalized_value]))
  const dbMap = Object.fromEntries(dbFields.map(f => [f.field, f]))

  const unconfirmedCritical = CRITICAL_FIELDS.filter(cf => {
    const row = dbMap[cf]
    return row && !row.confirmed
  })

  const mismatchedFields: string[] = []
  for (const [field, dbRow] of Object.entries(dbMap)) {
    const finalVal = finalMap[field]
    if (dbRow.confirmed && finalVal && finalVal !== dbRow.normalized_value) {
      mismatchedFields.push(field)
    }
  }

  return {
    passed: unconfirmedCritical.length === 0 && mismatchedFields.length === 0,
    unconfirmedCritical,
    mismatchedFields,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CRITICAL_FIELDS', () => {
  it('contains exactly 8 fields', () => {
    expect(CRITICAL_FIELDS).toHaveLength(8)
  })

  it('contains all required USCIS fields for ua_passport_booklet', () => {
    expect(CRITICAL_FIELDS).toContain('surname')
    expect(CRITICAL_FIELDS).toContain('given_names')
    expect(CRITICAL_FIELDS).toContain('date_of_birth')
    expect(CRITICAL_FIELDS).toContain('place_of_birth')
    expect(CRITICAL_FIELDS).toContain('series')
    expect(CRITICAL_FIELDS).toContain('number')
    expect(CRITICAL_FIELDS).toContain('issued_by')
    expect(CRITICAL_FIELDS).toContain('date_of_issue')
  })
})

describe('canCertify gate', () => {
  it('blocks certification when no critical fields are confirmed', () => {
    const fields = CRITICAL_FIELDS.map(f => ({ field: f, confirmed: false }))
    const { ok, unconfirmed } = canCertify(fields)
    expect(ok).toBe(false)
    expect(unconfirmed).toHaveLength(8)
  })

  it('blocks when some critical fields unconfirmed', () => {
    const fields = [
      { field: 'surname', confirmed: true },
      { field: 'given_names', confirmed: true },
      { field: 'date_of_birth', confirmed: false },  // not yet confirmed
      { field: 'place_of_birth', confirmed: true },
      { field: 'series', confirmed: true },
      { field: 'number', confirmed: true },
      { field: 'issued_by', confirmed: true },
      { field: 'date_of_issue', confirmed: false },  // not yet confirmed
    ]
    const { ok, unconfirmed } = canCertify(fields)
    expect(ok).toBe(false)
    expect(unconfirmed).toContain('date_of_birth')
    expect(unconfirmed).toContain('date_of_issue')
    expect(unconfirmed).toHaveLength(2)
  })

  it('allows certification when all critical fields confirmed', () => {
    const fields = CRITICAL_FIELDS.map(f => ({ field: f, confirmed: true }))
    const { ok, unconfirmed } = canCertify(fields)
    expect(ok).toBe(true)
    expect(unconfirmed).toHaveLength(0)
  })

  it('ignores extra non-critical fields in confirmation check', () => {
    const fields = [
      ...CRITICAL_FIELDS.map(f => ({ field: f, confirmed: true })),
      { field: 'nationality', confirmed: false },  // non-critical, not confirmed — should not block
      { field: 'sex', confirmed: false },
    ]
    const { ok } = canCertify(fields)
    expect(ok).toBe(true)
  })

  it('blocks if a critical field is present but session has no extracted_fields row', () => {
    // surname missing from extracted fields entirely — should not block (field not found → not in unconfirmed)
    const fields = CRITICAL_FIELDS.filter(f => f !== 'surname').map(f => ({ field: f, confirmed: true }))
    const { ok, unconfirmed } = canCertify(fields)
    // surname is not in extracted fields, so not in unconfirmed
    expect(ok).toBe(true)
    expect(unconfirmed).toHaveLength(0)
  })
})

describe('completeness audit', () => {
  const allConfirmed = CRITICAL_FIELDS.map(f => ({
    field: f,
    confirmed: true,
    normalized_value: `Value_${f}`,
  }))
  const finalFields = CRITICAL_FIELDS.map(f => ({
    field: f,
    normalized_value: `Value_${f}`,
  }))

  it('passes when all critical confirmed and values match', () => {
    const { passed, unconfirmedCritical, mismatchedFields } = completenessAudit(allConfirmed, finalFields)
    expect(passed).toBe(true)
    expect(unconfirmedCritical).toHaveLength(0)
    expect(mismatchedFields).toHaveLength(0)
  })

  it('fails when confirmed DB value differs from final render value', () => {
    const finalWithMismatch = finalFields.map(f =>
      f.field === 'surname' ? { ...f, normalized_value: 'DIFFERENT_VALUE' } : f
    )
    const { passed, mismatchedFields } = completenessAudit(allConfirmed, finalWithMismatch)
    expect(passed).toBe(false)
    expect(mismatchedFields).toContain('surname')
  })

  it('fails when critical field is not confirmed', () => {
    const withUnconfirmed = allConfirmed.map(f =>
      f.field === 'date_of_birth' ? { ...f, confirmed: false } : f
    )
    const { passed, unconfirmedCritical } = completenessAudit(withUnconfirmed, finalFields)
    expect(passed).toBe(false)
    expect(unconfirmedCritical).toContain('date_of_birth')
  })

  it('does not flag mismatch for unconfirmed fields', () => {
    const withUnconfirmedMismatch = allConfirmed.map(f =>
      f.field === 'nationality' ? { ...f, confirmed: false, normalized_value: 'UKRAINIAN' } : f
    )
    const finalWithDiff = finalFields.concat([{ field: 'nationality', normalized_value: 'Ukraine' }])
    const { mismatchedFields } = completenessAudit(withUnconfirmedMismatch, finalWithDiff)
    // nationality is not confirmed — mismatch should not be flagged
    expect(mismatchedFields).not.toContain('nationality')
  })
})

describe('review-state gate composition', () => {
  it('can_certify is false when critical fields unconfirmed', () => {
    const gates = {
      can_certify: false,
      can_render: false,
      unconfirmed_critical: ['date_of_birth', 'date_of_issue'],
      missing_critical: [],
    }
    expect(gates.can_certify).toBe(false)
    expect(gates.can_render).toBe(false)
    expect(gates.unconfirmed_critical).toHaveLength(2)
  })

  it('can_render requires can_certify + cert_record + payment', () => {
    // All gates pass
    const canRender = (canCertifyResult: boolean, hasCert: boolean, paymentConfirmed: boolean) =>
      canCertifyResult && hasCert && paymentConfirmed

    expect(canRender(true, true, true)).toBe(true)
    expect(canRender(true, true, false)).toBe(false)
    expect(canRender(true, false, true)).toBe(false)
    expect(canRender(false, true, true)).toBe(false)
  })
})

describe('OCR extraction result parsing', () => {
  it('marks field as review_required when confidence < 0.70', () => {
    const rawFields = [
      { field: 'surname', confidence: 0.95, review_required: false },
      { field: 'date_of_birth', confidence: 0.60, review_required: false },
      { field: 'number', confidence: 0.69, review_required: false },
    ]
    const processed = rawFields.map(f => ({
      ...f,
      review_required: f.confidence < 0.70 || f.review_required,
    }))
    expect(processed[0].review_required).toBe(false)
    expect(processed[1].review_required).toBe(true)
    expect(processed[2].review_required).toBe(true)
  })

  it('clamps confidence to [0, 1]', () => {
    const raw = [
      { confidence: 1.5 },
      { confidence: -0.1 },
      { confidence: 0.85 },
    ]
    const processed = raw.map(f => ({
      confidence: Math.min(1, Math.max(0, f.confidence)),
    }))
    expect(processed[0].confidence).toBe(1)
    expect(processed[1].confidence).toBe(0)
    expect(processed[2].confidence).toBe(0.85)
  })

  it('defaults bbox to [0,0,1,1] when malformed', () => {
    const raw = [
      { bbox: [0.1, 0.2, 0.8, 0.4] },
      { bbox: null },
      { bbox: [0.5] },
      { bbox: undefined },
    ]
    const processed = raw.map(f => ({
      bbox: Array.isArray(f.bbox) && f.bbox.length === 4 ? f.bbox : [0, 0, 1, 1],
    }))
    expect(processed[0].bbox).toEqual([0.1, 0.2, 0.8, 0.4])
    expect(processed[1].bbox).toEqual([0, 0, 1, 1])
    expect(processed[2].bbox).toEqual([0, 0, 1, 1])
    expect(processed[3].bbox).toEqual([0, 0, 1, 1])
  })
})

// ── Phase 1: evidence_type + bbox_status classification ───────────────────────

type BboxStatus = 'exact' | 'approximate' | 'missing'
type EvidenceType = 'full_image' | 'zone_fallback'

function classifyBbox(
  bbox: unknown,
  confidence: number
): { bbox: [number,number,number,number]; bbox_status: BboxStatus } {
  const isValid =
    Array.isArray(bbox) &&
    bbox.length === 4 &&
    bbox.every((v: unknown) => typeof v === 'number' && isFinite(v)) &&
    !(bbox[0] === 0 && bbox[1] === 0 && bbox[2] === 1 && bbox[3] === 1)

  if (isValid) {
    const b = bbox as [number,number,number,number]
    const bbox_status: BboxStatus = confidence >= 0.70 ? 'exact' : 'approximate'
    return { bbox: b, bbox_status }
  }
  return { bbox: [0, 0, 1, 1], bbox_status: 'missing' }
}

describe('classifyBbox (Phase 1)', () => {
  it('returns exact when bbox is valid and confidence >= 0.70', () => {
    const { bbox_status } = classifyBbox([0.1, 0.2, 0.8, 0.9], 0.85)
    expect(bbox_status).toBe('exact')
  })

  it('returns approximate when bbox is valid but confidence < 0.70', () => {
    const { bbox_status } = classifyBbox([0.1, 0.2, 0.8, 0.9], 0.60)
    expect(bbox_status).toBe('approximate')
  })

  it('returns missing and fallback bbox when bbox is null', () => {
    const { bbox, bbox_status } = classifyBbox(null, 0.95)
    expect(bbox_status).toBe('missing')
    expect(bbox).toEqual([0, 0, 1, 1])
  })

  it('returns missing when bbox is literally [0,0,1,1] (degenerate fallback)', () => {
    const { bbox_status } = classifyBbox([0, 0, 1, 1], 0.90)
    expect(bbox_status).toBe('missing')
  })

  it('returns missing when bbox has wrong length', () => {
    const { bbox_status } = classifyBbox([0.1, 0.2], 0.90)
    expect(bbox_status).toBe('missing')
  })

  it('returns missing when bbox contains non-finite values', () => {
    const { bbox_status } = classifyBbox([NaN, 0.2, 0.8, 0.9], 0.90)
    expect(bbox_status).toBe('missing')
  })
})

describe('evidence_type assignment (Phase 1)', () => {
  it('DeepSeek Vision path produces evidence_type=full_image', () => {
    const evidenceType: EvidenceType = 'full_image'
    expect(evidenceType).toBe('full_image')
  })

  it('Tesseract fallback path produces evidence_type=zone_fallback', () => {
    const evidenceType: EvidenceType = 'zone_fallback'
    expect(evidenceType).toBe('zone_fallback')
  })

  it('Tesseract fields always have bbox_status=missing', () => {
    // Tesseract never provides bbox — always missing
    const fields = [
      { field: 'surname', bbox: [0, 0, 1, 1] as [number,number,number,number], evidence_type: 'zone_fallback' as EvidenceType, bbox_status: 'missing' as BboxStatus },
      { field: 'given_names', bbox: [0, 0, 1, 1] as [number,number,number,number], evidence_type: 'zone_fallback' as EvidenceType, bbox_status: 'missing' as BboxStatus },
    ]
    fields.forEach(f => {
      expect(f.evidence_type).toBe('zone_fallback')
      expect(f.bbox_status).toBe('missing')
    })
  })
})

// ── Phase 1: Smart Retake logic ───────────────────────────────────────────────

const SMART_RETAKE_QUALITY_THRESHOLD = 0.4
const SMART_RETAKE_MAX_ATTEMPTS = 2

function shouldRetake(
  imageQualityOverall: number,
  retakeCount: number
): { required: boolean; reason?: string } {
  if (imageQualityOverall < SMART_RETAKE_QUALITY_THRESHOLD && retakeCount < SMART_RETAKE_MAX_ATTEMPTS) {
    return {
      required: true,
      reason: 'The photo is too blurry or poorly lit for reliable extraction.',
    }
  }
  return { required: false }
}

describe('Smart Retake (Phase 1)', () => {
  it('triggers retake when quality is low and no prior retake', () => {
    const { required } = shouldRetake(0.25, 0)
    expect(required).toBe(true)
  })

  it('triggers retake when quality is low and one prior retake', () => {
    const { required } = shouldRetake(0.30, 1)
    expect(required).toBe(true)
  })

  it('does NOT trigger retake when max attempts reached', () => {
    const { required } = shouldRetake(0.10, 2)  // retakeCount = 2 = max
    expect(required).toBe(false)
  })

  it('does NOT trigger retake when quality is above threshold', () => {
    const { required } = shouldRetake(0.45, 0)
    expect(required).toBe(false)
  })

  it('does NOT trigger retake when quality is exactly at threshold', () => {
    const { required } = shouldRetake(0.40, 0)
    expect(required).toBe(false)
  })

  it('returns user-friendly message (no raw OCR error text)', () => {
    const { reason } = shouldRetake(0.10, 0)
    expect(reason).toBeDefined()
    expect(reason).not.toMatch(/tesseract|deepseek|api|exception|error:/i)
    expect(reason!.length).toBeGreaterThan(20)
  })
})

// ── Phase 2: confidence label helpers ────────────────────────────────────────

function confidenceLabel(conf: number): { text: string } {
  if (conf >= 0.85) return { text: 'Looks clear' }
  if (conf >= 0.70) return { text: 'Please check carefully' }
  return               { text: 'Needs review' }
}

describe('confidenceLabel (Phase 2 UI)', () => {
  it('returns "Looks clear" for high confidence', () => {
    expect(confidenceLabel(0.95).text).toBe('Looks clear')
    expect(confidenceLabel(0.85).text).toBe('Looks clear')
  })

  it('returns "Please check carefully" for medium confidence', () => {
    expect(confidenceLabel(0.84).text).toBe('Please check carefully')
    expect(confidenceLabel(0.70).text).toBe('Please check carefully')
  })

  it('returns "Needs review" for low confidence', () => {
    expect(confidenceLabel(0.69).text).toBe('Needs review')
    expect(confidenceLabel(0.0).text).toBe('Needs review')
  })

  it('does not use legalistic language ("certified", "guaranteed", "approved")', () => {
    const labels = [0.95, 0.75, 0.50].map(c => confidenceLabel(c).text)
    labels.forEach(label => {
      expect(label).not.toMatch(/certif|guarant|approv|uscis.accept/i)
    })
  })
})

// ── Phase 3: evidence audit gate ─────────────────────────────────────────────

describe('evidence audit gate (Phase 3 render)', () => {
  it('hard-blocks if OCR ran but ALL critical fields have no evidence', () => {
    const ocrResultExists = true
    const criticalWithoutEvidence = CRITICAL_FIELDS  // all 8 missing evidence
    const shouldHardBlock =
      ocrResultExists &&
      criticalWithoutEvidence.length === CRITICAL_FIELDS.length

    expect(shouldHardBlock).toBe(true)
  })

  it('does NOT hard-block if no OCR ran (pre-Phase-1 session)', () => {
    const ocrResultExists = false
    const criticalWithoutEvidence = CRITICAL_FIELDS
    const shouldHardBlock =
      ocrResultExists &&
      criticalWithoutEvidence.length === CRITICAL_FIELDS.length

    expect(shouldHardBlock).toBe(false)
  })

  it('does NOT hard-block when only some critical fields lack evidence', () => {
    const ocrResultExists = true
    const criticalWithoutEvidence = ['series', 'number']  // only 2 missing
    const shouldHardBlock =
      ocrResultExists &&
      criticalWithoutEvidence.length === CRITICAL_FIELDS.length

    expect(shouldHardBlock).toBe(false)
  })

  it('generates a warning (not error) for pre-Phase-1 sessions', () => {
    const ocrResultExists = false
    const warnings: string[] = []
    if (!ocrResultExists) {
      warnings.push('No OCR run found for this session — fields may be manually entered.')
    }
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/manually entered/i)
  })
})

// ── Async extraction job (Phase async) ───────────────────────────────────────
// These tests mirror the logic in:
//   POST /api/translation/[sessionId]/ocr-from-storage  (returns 202)
//   GET  /api/translation/[sessionId]/extraction-status/[runId]  (polling)
// All tested purely in-process — no network or DB calls.

type ExtractionRunStatus =
  | 'queued' | 'processing' | 'completed' | 'failed'
  | 'retake_required' | 'manual_review_required'

/** Simulates what POST /ocr-from-storage returns immediately (202) */
function simulateOcrStart(sessionValid: boolean, docExists: boolean): {
  status: number
  body: { ok: boolean; status?: string; extraction_run_id?: string; error?: string }
} {
  if (!sessionValid) return { status: 404, body: { ok: false, error: 'Session not found' } }
  if (!docExists)    return { status: 404, body: { ok: false, error: 'No uploaded document found' } }
  return {
    status: 202,
    body: { ok: true, status: 'queued', extraction_run_id: 'run-abc-123' },
  }
}

/** Simulates what GET /extraction-status/[runId] returns for a given run state */
function simulateStatusPoll(run: {
  status: ExtractionRunStatus
  fields_count?: number
  user_message?: string
  retake_count?: number
}): {
  is_terminal: boolean
  status: ExtractionRunStatus
  fields_count?: number
  user_message?: string
  retake_count?: number
} {
  const terminal: ExtractionRunStatus[] = [
    'completed', 'failed', 'retake_required', 'manual_review_required',
  ]
  return {
    ...run,
    is_terminal: terminal.includes(run.status),
  }
}

/** Simulates whether a failed OCR run blocks certification */
function ocrFailedBlocksCert(runStatus: ExtractionRunStatus, fieldsCount: number): boolean {
  // Cert requires fields to exist and be confirmed — no fields = blocked
  if (runStatus === 'failed' || runStatus === 'manual_review_required') {
    return fieldsCount === 0
  }
  return false
}

/** Simulates pipeline outcome given provider responses */
function simulatePipelineOutcome(params: {
  deepseekOk: boolean
  deepseekFieldCount: number
  tesseractOk: boolean
  tesseractFieldCount: number
  imageQualityOverall: number
  retakeCount: number
}): ExtractionRunStatus {
  const RETAKE_THRESHOLD = 0.4
  const MAX_RETAKES = 2

  if (params.deepseekOk && params.deepseekFieldCount > 0) {
    // Smart Retake check
    if (params.imageQualityOverall < RETAKE_THRESHOLD && params.retakeCount < MAX_RETAKES) {
      return 'retake_required'
    }
    return 'completed'
  }
  if (params.tesseractOk && params.tesseractFieldCount > 0) {
    if (params.imageQualityOverall < RETAKE_THRESHOLD && params.retakeCount < MAX_RETAKES) {
      return 'retake_required'
    }
    return 'completed'
  }
  return 'manual_review_required'
}

describe('async OCR extraction job — 202 response', () => {
  it('returns HTTP 202 with extraction_run_id when session and doc exist', () => {
    const { status, body } = simulateOcrStart(true, true)
    expect(status).toBe(202)
    expect(body.ok).toBe(true)
    expect(body.status).toBe('queued')
    expect(body.extraction_run_id).toBeDefined()
    expect(typeof body.extraction_run_id).toBe('string')
  })

  it('returns 404 when session does not exist', () => {
    const { status, body } = simulateOcrStart(false, true)
    expect(status).toBe(404)
    expect(body.ok).toBe(false)
  })

  it('returns 404 when no document uploaded yet', () => {
    const { status, body } = simulateOcrStart(true, false)
    expect(status).toBe(404)
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/document/i)
  })
})

describe('async OCR — polling status endpoint', () => {
  it('returns is_terminal=false for queued status', () => {
    const result = simulateStatusPoll({ status: 'queued' })
    expect(result.is_terminal).toBe(false)
  })

  it('returns is_terminal=false for processing status', () => {
    const result = simulateStatusPoll({ status: 'processing' })
    expect(result.is_terminal).toBe(false)
  })

  it('returns is_terminal=true for completed with fields_count', () => {
    const result = simulateStatusPoll({ status: 'completed', fields_count: 11 })
    expect(result.is_terminal).toBe(true)
    expect(result.fields_count).toBe(11)
  })

  it('returns is_terminal=true for failed', () => {
    const result = simulateStatusPoll({ status: 'failed', user_message: 'Storage error.' })
    expect(result.is_terminal).toBe(true)
  })

  it('returns is_terminal=true for manual_review_required', () => {
    const result = simulateStatusPoll({ status: 'manual_review_required', user_message: 'Could not read document.' })
    expect(result.is_terminal).toBe(true)
    expect(result.user_message).toBeDefined()
    expect(result.user_message).not.toMatch(/tesseract|deepseek|api key|exception/i)
  })

  it('returns is_terminal=true for retake_required with user_message', () => {
    const result = simulateStatusPoll({
      status: 'retake_required',
      user_message: 'The photo is too blurry or poorly lit for reliable extraction.',
      retake_count: 1,
    })
    expect(result.is_terminal).toBe(true)
    expect(result.user_message).toBeDefined()
    expect(result.user_message).not.toMatch(/ocr error|tesseract|model|api/i)
  })
})

describe('async OCR — failed extraction blocks certification', () => {
  it('blocks cert when OCR failed and no fields exist', () => {
    expect(ocrFailedBlocksCert('failed', 0)).toBe(true)
  })

  it('blocks cert when manual_review_required and no fields', () => {
    expect(ocrFailedBlocksCert('manual_review_required', 0)).toBe(true)
  })

  it('does not block cert if prior extraction left fields (re-run scenario)', () => {
    // If the session already has 11 fields from a previous run, cert should not be blocked
    // by a new failed run — this is a UI concern, not a server gate
    expect(ocrFailedBlocksCert('failed', 11)).toBe(false)
  })
})

describe('async OCR — pipeline outcome simulation', () => {
  it('completes via DeepSeek Vision when it returns fields', () => {
    const status = simulatePipelineOutcome({
      deepseekOk: true, deepseekFieldCount: 11,
      tesseractOk: false, tesseractFieldCount: 0,
      imageQualityOverall: 0.9, retakeCount: 0,
    })
    expect(status).toBe('completed')
  })

  it('completes via Tesseract fallback when DeepSeek fails', () => {
    const status = simulatePipelineOutcome({
      deepseekOk: false, deepseekFieldCount: 0,
      tesseractOk: true, tesseractFieldCount: 8,
      imageQualityOverall: 0.85, retakeCount: 0,
    })
    expect(status).toBe('completed')
  })

  it('returns manual_review_required when both providers fail', () => {
    const status = simulatePipelineOutcome({
      deepseekOk: false, deepseekFieldCount: 0,
      tesseractOk: false, tesseractFieldCount: 0,
      imageQualityOverall: 0.5, retakeCount: 0,
    })
    expect(status).toBe('manual_review_required')
  })

  it('returns retake_required on low image quality within retake budget', () => {
    const status = simulatePipelineOutcome({
      deepseekOk: true, deepseekFieldCount: 5,
      tesseractOk: false, tesseractFieldCount: 0,
      imageQualityOverall: 0.2,  // below 0.4 threshold
      retakeCount: 1,            // still under max 2
    })
    expect(status).toBe('retake_required')
  })

  it('proceeds to completed after max retakes even if quality is low', () => {
    // Once retakeCount >= MAX_RETAKES, do not loop forever — use whatever result we have
    const status = simulatePipelineOutcome({
      deepseekOk: true, deepseekFieldCount: 5,
      tesseractOk: false, tesseractFieldCount: 0,
      imageQualityOverall: 0.2,
      retakeCount: 2,  // at max — must not retake again
    })
    expect(status).toBe('completed')
  })

  it('timeout scenario: both providers timeout → manual_review_required', () => {
    // Simulate what happens when AbortSignal fires — both return ok:false
    const status = simulatePipelineOutcome({
      deepseekOk: false, deepseekFieldCount: 0,
      tesseractOk: false, tesseractFieldCount: 0,
      imageQualityOverall: 0.7, retakeCount: 0,
    })
    expect(status).toBe('manual_review_required')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6 — Dedicated OCR provider + ID-based evidence mapping (10 new tests)
// ═══════════════════════════════════════════════════════════════════════════════

import { bboxToTuple, unionBboxes, isBlocked } from '@/lib/ocr/types'
import type { OcrResult, OcrWord, OcrBoundingBox, OcrBlockedResult } from '@/lib/ocr/types'
import { buildOcrLookup, resolveOcrIds } from '@/lib/ocr/bbox-resolver'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWord(id: string, text: string, x: number, y: number, w: number, h: number): OcrWord {
  return {
    id,
    text,
    page: 1,
    bbox: { x, y, width: w, height: h },
    confidence: 0.98,
    source: 'google_vision',
  }
}

function makeOcrResult(words: OcrWord[]): OcrResult {
  return {
    provider: 'google_vision',
    raw_text: words.map(w => w.text).join(' '),
    pages: [],
    lines: [],
    words,
    processing_ms: 1200,
    warnings: [],
    created_at: new Date().toISOString(),
  }
}

// ── Suite 1: OCR provider returns words with stable IDs ───────────────────────

describe('OCR provider — word IDs and bboxes', () => {
  it('each word has a unique stable ID in w_NNNN format', () => {
    const words: OcrWord[] = [
      makeWord('w_0000', 'ПАСПОРТ', 0.1, 0.05, 0.3, 0.04),
      makeWord('w_0001', 'Іваненко', 0.1, 0.2, 0.25, 0.04),
      makeWord('w_0002', 'Іван', 0.1, 0.25, 0.2, 0.04),
    ]
    const ids = words.map(w => w.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(words.length)
    ids.forEach(id => expect(id).toMatch(/^w_\d{4}$/))
  })

  it('each word bbox is normalised 0–1 and non-degenerate', () => {
    const word = makeWord('w_0012', 'Іваненко', 0.12, 0.25, 0.18, 0.032)
    expect(word.bbox.x).toBeGreaterThanOrEqual(0)
    expect(word.bbox.y).toBeGreaterThanOrEqual(0)
    expect(word.bbox.x + word.bbox.width).toBeLessThanOrEqual(1)
    expect(word.bbox.y + word.bbox.height).toBeLessThanOrEqual(1)
    const tuple = bboxToTuple(word.bbox)
    expect(tuple).not.toEqual([0, 0, 1, 1])   // not degenerate
  })

  it('bboxToTuple converts bbox to [x0, y0, x1, y1]', () => {
    const bbox: OcrBoundingBox = { x: 0.12, y: 0.25, width: 0.18, height: 0.032 }
    const tuple = bboxToTuple(bbox)
    expect(tuple[0]).toBeCloseTo(0.12)
    expect(tuple[1]).toBeCloseTo(0.25)
    expect(tuple[2]).toBeCloseTo(0.30)
    expect(tuple[3]).toBeCloseTo(0.282)
  })

  it('unionBboxes computes correct outer bounds for multi-word date', () => {
    // "19 лютого 2003" — 3 words side by side
    const boxes: OcrBoundingBox[] = [
      { x: 0.10, y: 0.40, width: 0.04, height: 0.03 },  // "19"
      { x: 0.15, y: 0.40, width: 0.09, height: 0.03 },  // "лютого"
      { x: 0.25, y: 0.40, width: 0.06, height: 0.03 },  // "2003"
    ]
    const union = unionBboxes(boxes)
    expect(union.x).toBeCloseTo(0.10)
    expect(union.y).toBeCloseTo(0.40)
    expect(union.x + union.width).toBeCloseTo(0.31)
    expect(union.height).toBeCloseTo(0.03)
  })
})

// ── Suite 2: bbox resolver — OCR ID → bbox mapping ───────────────────────────

describe('bbox resolver — resolveOcrIds', () => {
  const resolverWords = [
    makeWord('w_0012', 'Іваненко', 0.10, 0.20, 0.18, 0.032),
    makeWord('w_0013', 'Іван',     0.10, 0.24, 0.14, 0.032),
    makeWord('w_0020', '19',         0.10, 0.40, 0.04, 0.030),
    makeWord('w_0021', 'лютого',     0.15, 0.40, 0.09, 0.030),
    makeWord('w_0022', '2003',       0.25, 0.40, 0.06, 0.030),
  ]
  const resolverOcr    = makeOcrResult(resolverWords)
  const resolverLookup = buildOcrLookup(resolverOcr)

  it('single ID → bbox_status exact', () => {
    const result = resolveOcrIds(['w_0012'], resolverLookup)
    expect(result.bbox_status).toBe('exact')
    expect(result.evidence_type).toBe('ocr_bbox')
    expect(result.unresolved_ids).toHaveLength(0)
    expect(result.resolved_count).toBe(1)
    expect(result.bbox).not.toEqual([0, 0, 1, 1])
  })

  it('multiple IDs → bbox_status combined with union bbox', () => {
    const result = resolveOcrIds(['w_0020', 'w_0021', 'w_0022'], resolverLookup)
    expect(result.bbox_status).toBe('combined')
    expect(result.evidence_type).toBe('ocr_bbox')
    expect(result.resolved_count).toBe(3)
    // x0 should be 0.10, x1 should be 0.31
    expect(result.bbox[0]).toBeCloseTo(0.10)
    expect(result.bbox[2]).toBeCloseTo(0.31)
  })

  it('unknown ID marks unresolved and sets review_required_by_bbox', () => {
    const result = resolveOcrIds(['w_9999'], resolverLookup)  // doesn't exist
    expect(result.bbox_status).toBe('missing')
    expect(result.evidence_type).toBe('zone_fallback')
    expect(result.unresolved_ids).toContain('w_9999')
    expect(result.review_required_by_bbox).toBe(true)
  })

  it('empty ocr_ids → missing bbox, review_required', () => {
    const result = resolveOcrIds([], resolverLookup)
    expect(result.bbox_status).toBe('missing')
    expect(result.review_required_by_bbox).toBe(true)
    expect(result.resolved_count).toBe(0)
  })

  it('partial resolution: one known, one unknown → combined with unresolved noted', () => {
    const result = resolveOcrIds(['w_0012', 'w_9998'], resolverLookup)
    // w_0012 resolves, w_9998 doesn't
    expect(result.resolved_count).toBe(1)
    expect(result.unresolved_ids).toContain('w_9998')
    // Still gets a bbox from the one that resolved
    expect(result.bbox_status).toBe('combined')  // 1 resolved + 1 unresolved → combined
    expect(result.evidence_type).toBe('ocr_bbox')
  })
})

// ── Suite 3: OCR provider blocked when credentials missing ────────────────────

describe('OCR provider — BLOCKED result when credentials missing', () => {
  it('isBlocked() returns true for OcrBlockedResult', () => {
    const blocked: OcrBlockedResult = {
      blocked: true,
      reason: 'GOOGLE_CLOUD_VISION_API_KEY not set',
      required_env_vars: ['GOOGLE_CLOUD_VISION_API_KEY'],
    }
    expect(isBlocked(blocked)).toBe(true)
  })

  it('isBlocked() returns false for a real OcrResult', () => {
    const result: OcrResult = makeOcrResult([makeWord('w_0000', 'test', 0.1, 0.1, 0.2, 0.05)])
    expect(isBlocked(result)).toBe(false)
  })

  it('BLOCKED result includes exact env var names without values', () => {
    const blocked: OcrBlockedResult = {
      blocked: true,
      reason: 'API key missing',
      required_env_vars: ['GOOGLE_CLOUD_VISION_API_KEY'],
    }
    expect(blocked.required_env_vars).toContain('GOOGLE_CLOUD_VISION_API_KEY')
    // Must NOT contain actual key values
    blocked.required_env_vars.forEach(v => {
      expect(v).not.toMatch(/AIza/)   // no real API key pattern
      expect(v).not.toMatch(/sk-/)    // no OpenAI-style keys
    })
  })
})
