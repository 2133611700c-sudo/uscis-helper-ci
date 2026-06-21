/**
 * canonical/core/readDocumentCore.ts — the ONE runtime document reader (v1 spine).
 *
 * document in → one CanonicalDocumentResult out (or "needs_better_photo"). The
 * readers (Gemini visual, MRZ) are INJECTED so this is testable and the real
 * OCR/vision wiring is a thin call (no rewrite of recognition).
 *
 * v1 flow:  quality gate → visual read (Gemini) → MRZ read (if passport) →
 *           minimal arbitration → one result.
 *
 * NOT wired to any product. No flags. See ONE_BRAIN_DECISION.md.
 */
import type { CanonicalDocumentResult } from '../types'
import { arbitrateDocument } from './arbitration'
import type { CoreReaders, CoreResult, ReadDocumentCoreRequest, FieldCandidate } from './types'

export async function readDocumentCore(
  req: ReadDocumentCoreRequest,
  readers: CoreReaders,
): Promise<CoreResult> {
  // 1) Quality gate — bad photo never produces garbage, it asks to retake.
  const q = await readers.qualityGate(req.file)
  if (!q.ok) {
    return { status: 'needs_better_photo', reason: q.reason ?? 'low_image_quality' }
  }

  // 2) Primary visual reader (one pass over the image).
  const candidates: FieldCandidate[] = [...(await readers.visualRead(req.file, req.hint))]

  // 3) MRZ parse only when a passport/MRZ is expected (no double-run otherwise).
  if (req.expectMrz && readers.mrzRead) {
    candidates.push(...(await readers.mrzRead(req.file)))
  }

  // 4) The Core judges. No candidate for a field → no field (Law 1).
  const fields = arbitrateDocument(candidates)

  // If recognition produced nothing usable, treat as "ask for a better photo"
  // rather than emitting an empty, useless result.
  if (fields.length === 0) {
    return { status: 'needs_better_photo', reason: 'no_fields_recognized' }
  }

  const result: CanonicalDocumentResult = {
    documentSessionId: req.documentSessionId,
    product: req.product,
    docType: req.docType,
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: req.createdAt,
    requiresReview: fields.some((f) => f.reviewRequired),
  }
  return { status: 'ok', result }
}
