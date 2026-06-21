/**
 * renderFromCanonical — render a translation PDF from a RESOLVED canonical document.
 *
 * This is the only sanctioned render path for the V2 operator pipeline. It:
 *   1. resolves the canonical (base + confirmed operator overrides)
 *   2. maps each canonical field → the PDF renderer's ExtractedField shape,
 *      feeding the RESOLVED finalValue (NOT a fabricated confidence=1 / raw=edited
 *      field). C3-null fields (finalValue=null with no confirmed override) are
 *      OMITTED — INV-11 (never released without an explicit override).
 *   3. renders ONCE via the existing generateTranslationPDF renderer
 *   4. computes the byte SHA-256 and the 7-field certification binding
 *
 * The 7 certification fields (CERTIFICATION_REPRODUCIBILITY_CONTRACT):
 *   canonical_document_id, base_canonical_hash, resolved_canonical_hash,
 *   override_set_hash, override_version, canonical_schema_version, renderer_version.
 *
 * PII: never logs field values or recipient data — only field keys/counts/hashes.
 */
import { createHash } from 'crypto'
import { generateTranslationPDF } from '@/lib/packet/pdf'
import { buildCertificationRecord } from '@/lib/translation/certificationRecord'
import { canonicalToFieldOut } from '@/lib/canonical/core/translationAdapter'
import {
  loadCanonicalDocumentById,
  resolveCanonicalDocument,
  listCanonicalOverrides,
  computeFieldsHash,
  computeResolvedHash,
  computeOverrideSetHash,
} from '@/lib/canonical/persistence'
import { CANONICAL_SCHEMA_VERSION, RENDERER_VERSION } from '@/lib/canonical/version'
import type { ExtractedField } from '@/lib/translation/types'

const LANG_LABELS: Record<string, string> = {
  ru: 'Russian',
  uk: 'Ukrainian',
  'uk-soviet': 'Ukrainian (Soviet era)',
}

/** The 7-field certification binding — proves the artifact is reproducible. */
export interface CertificationBinding {
  canonicalDocumentId: string
  baseCanonicalHash: string
  resolvedCanonicalHash: string
  overrideSetHash: string
  overrideVersion: number
  canonicalSchemaVersion: string
  rendererVersion: string
}

export interface RenderFromCanonicalResult {
  pdfBytes: Buffer
  artifactSha256: string
  byteSize: number
  certification: CertificationBinding
  /** PII-free: field keys rendered (for audit metadata). */
  renderedKeys: string[]
  /** PII-free: count of C3-null keys omitted (INV-11). */
  omittedNullCount: number
}

export class CanonicalRenderError extends Error {
  readonly code: 'CANONICAL_NOT_FOUND' | 'CANONICAL_STORAGE_UNAVAILABLE' | 'SIGNER_NOT_CONFIGURED'
  constructor(code: CanonicalRenderError['code'], message?: string) {
    super(message ?? code)
    this.name = 'CanonicalRenderError'
    this.code = code
  }
}

export interface RenderFromCanonicalInput {
  canonicalDocumentId: string
  docType: string
  sourceLang?: string
  /** Order id used only as the PDF's session reference (not PII). */
  sessionRef: string
}

/**
 * Render the certified PDF from the resolved canonical and return the bytes + the
 * full certification binding. Throws CanonicalRenderError on not-found / infra /
 * missing signer config. The caller persists the artifact + enqueues delivery.
 */
export async function renderFromCanonical(
  input: RenderFromCanonicalInput,
): Promise<RenderFromCanonicalResult> {
  const signerName = process.env.OPERATOR_SIGNER_NAME ?? ''
  if (!signerName.trim()) {
    throw new CanonicalRenderError('SIGNER_NOT_CONFIGURED', 'OPERATOR_SIGNER_NAME not set')
  }

  // Base (immutable) + resolved (base + confirmed overrides) + override metadata.
  let base, resolved, overrides
  try {
    base = await loadCanonicalDocumentById(input.canonicalDocumentId)
    if (!base) throw new CanonicalRenderError('CANONICAL_NOT_FOUND')
    resolved = await resolveCanonicalDocument(input.canonicalDocumentId)
    overrides = await listCanonicalOverrides(input.canonicalDocumentId)
  } catch (e) {
    if (e instanceof CanonicalRenderError) throw e
    throw new CanonicalRenderError('CANONICAL_STORAGE_UNAVAILABLE', (e as Error).message)
  }
  if (!resolved) throw new CanonicalRenderError('CANONICAL_NOT_FOUND')

  // ── Certification binding (7 fields) ─────────────────────────────────────────
  const baseCanonicalHash = computeFieldsHash(base)
  const resolvedCanonicalHash = computeResolvedHash(baseCanonicalHash, overrides)
  const overrideSetHash = computeOverrideSetHash(overrides)
  const overrideVersion = overrides.reduce((mx, o) => Math.max(mx, o.version ?? 0), 0)

  const certification: CertificationBinding = {
    canonicalDocumentId: input.canonicalDocumentId,
    baseCanonicalHash,
    resolvedCanonicalHash,
    overrideSetHash,
    overrideVersion,
    canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
    rendererVersion: RENDERER_VERSION,
  }

  // ── Resolved canonical → renderer fields (NO fabrication) ────────────────────
  // We feed the RESOLVED finalValue. C3-null (no confirmed override) → omitted.
  const renderedKeys: string[] = []
  let omittedNullCount = 0
  const fields: ExtractedField[] = []
  for (const f of resolved.fields) {
    const fo = canonicalToFieldOut(f)
    if (fo.value === null) {
      omittedNullCount += 1
      continue // INV-11: never release a C3-null without an explicit override
    }
    renderedKeys.push(fo.field)
    fields.push({
      field: fo.field,
      source_label: fo.kind ?? 'canonical',
      source_zone: fo.kind ?? 'canonical',
      bbox: [0, 0, 0, 0],
      raw_value: fo.raw_cyrillic ?? fo.value ?? '',
      normalized_value: fo.value ?? '',
      // finalValue is the release value; the renderer prefers it (Phase 3 contract).
      final_value: fo.value,
      language_layer: 'unknown',
      // Carry the resolved field's own confidence/review — do NOT fabricate 1/false.
      confidence: fo.confidence,
      review_required: fo.review_required,
    } as ExtractedField)
  }

  const certificationRecord = buildCertificationRecord({
    signerName,
    signerAddress: process.env.OPERATOR_SIGNER_ADDRESS ?? '',
    signerPhone: '',
    signerEmail: '',
    sourceLanguage: LANG_LABELS[input.sourceLang ?? 'uk'] ?? 'Ukrainian',
    signatureTypedName: signerName,
  })

  const docTypeLabel = input.docType.replace(/_/g, ' ')
  const pdfBytes = await generateTranslationPDF({
    scopeTitle: `English Translation of ${docTypeLabel}`,
    documentType: input.docType,
    fields,
    sourceTraces: [],
    certificationRecord,
    sessionId: input.sessionRef,
  })

  const artifactSha256 = createHash('sha256').update(pdfBytes).digest('hex')

  return {
    pdfBytes,
    artifactSha256,
    byteSize: pdfBytes.byteLength,
    certification,
    renderedKeys,
    omittedNullCount,
  }
}
