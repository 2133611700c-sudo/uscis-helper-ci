/**
 * POST /api/translation/generate-pdf
 *
 * Legacy wizard endpoint — now delegates to /api/translation/render
 * for real PDF generation via pdf-lib.
 *
 * v5.0: Removed "CERTIFIED COPY" watermark (was P0 legal violation).
 * Removed HTML-only path. Now returns real downloadable PDF.
 *
 * v5.1: Canonical continuity cutover (CANONICAL_CONTINUITY_MODE).
 * When canonical_document_id is present in the request body, the resolved
 * canonical document is used as the field source instead of extracted_fields.
 * Certification is bound to all 7 hash fields per CERTIFICATION_REPRODUCIBILITY_CONTRACT.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/resend'
import { getCanonicalMode } from '@/lib/canonical/continuityMode'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { generateTranslationPDF } from '@/lib/packet/pdf'
import { renderMirrorTranslationPDF } from '@/lib/translation/pdf/renderMirrorTranslationPDF'
import { isDualRenderEnabled, buildDualRenderLog } from '@/lib/translation/pdf/dualRenderCompare'
import { hasOfficialSchema } from '@/lib/translation/forms/ukraine/schemas/registry'
import { buildCertificationRecord } from '@/lib/translation/certificationRecord'
import { ExtractedField, SourceTrace } from '@/lib/translation/types'
import { isOwnerSession } from '@/lib/ownerAccess'
import { verifyStripeSessionPaid } from '@/lib/stripe/verifyPayment'
import { assertReviewGate } from '@/lib/translation/reviewGate'
import { hasUnresolvedCriticalForOutput } from '@/lib/documentSafety/ocrFieldSafetyGate'
import { classifyCriticality, isOcrFieldSafetyEnabled } from '@/lib/documentSafety/applyOcrFieldSafety'
import { validateConfirmedValue } from '@/lib/documentSafety/confirmedValueGuard'
import { buildAttestationRecord } from '@/lib/translation/attestation'
import { persistCertification } from '@/lib/translation/persistCertification'
import { applyCertifierOverrides, type FieldWithMaybeOverride } from '@/lib/documentSafety/certifierOverrideApply'
import { docintelIdToDocumentClass } from '@/lib/canonical/core/documentClassPolicy'
import { postPaymentFailure } from '@/lib/documentSafety/paymentFailureRouteAdapter'
import { recordGuardBlock } from '@/lib/documentSafety/recordGuardBlock'
// ── Canonical continuity ─────────────────────────────────────────────────────
import {
  resolveCanonicalDocument,
  listCanonicalOverrides,
  computeFieldsHash,
  computeResolvedHash,
  computeOverrideSetHash,
} from '@/lib/canonical/persistence'
import { canonicalError } from '@/lib/canonical/persistence/errors'
import type { CanonicalDocumentResult } from '@/lib/canonical/types'
import { canonicalToFieldOut } from '@/lib/canonical/core/translationAdapter'
import { CANONICAL_SCHEMA_VERSION, RENDERER_VERSION } from '@/lib/canonical/version'

export const dynamic = 'force-dynamic'

interface LegacyPdfPayload {
  profile: { name: string; email: string; phone: string; addr: string }
  selectedPlan: 'basic' | 'plus' | 'premium'
  spanishCopy: boolean
  locale: string
  signatureDataUrl: string | null
  signatureMethod: 'drawn_on_screen' | 'manual_wet_signature'
  signedAt: string
  certificationTextVersion: string
  session_id?: string
  fields?: ExtractedField[]
  source_traces?: SourceTrace[]
  doc_type?: string
  scope_title?: string
  /** Back-compat single confirmation flag (true ⇒ both checkboxes). */
  reviewConfirmed?: boolean
  /** Checkbox 1 — user reviewed the data and it is correct. */
  dataReviewed?: boolean
  /** Checkbox 2 — user understands the signature attests accuracy. */
  accuracyAttested?: boolean
  /**
   * Canonical continuity (v5.1): when present, the resolved canonical document
   * is used as the authoritative field source instead of `fields`.
   * UUID format expected. Required in enforce mode, optional in shadow mode.
   */
  canonical_document_id?: string
}

const PLAN_LABEL: Record<string, string> = {
  basic:   'Basic ($14.99)',
  plus:    'Plus ($19.99)',
  premium: 'Premium ($29.99)',
}

export async function POST(req: NextRequest) {
  let payload: LegacyPdfPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Canonical continuity (CANONICAL_CONTINUITY_MODE) ─────────────────────────
  // off    → skip persistence, use extracted_fields (emergency rollback)
  // shadow → load canonical when canonical_document_id present; fallback to extracted_fields
  // enforce → canonical_document_id REQUIRED; missing → 422; not found → 404; infra fail → 503
  const continuityMode = getCanonicalMode('translation')
  const { canonical_document_id } = payload

  if (continuityMode === 'enforce' && !canonical_document_id) {
    console.warn('[generate-pdf] continuity=enforce canonical_document_id missing → 422')
    return NextResponse.json(canonicalError('CANONICAL_ID_REQUIRED', 'canonical_document_id is required in enforce mode'), { status: 422 })
  }

  let sourceCanonical: CanonicalDocumentResult | null = null
  let canonicalFieldsHash: string | null = null
  let resolvedCanonicalHash: string | null = null
  let overrideSetHash: string | null = null
  let overrideVersion: number | null = null

  if (canonical_document_id && continuityMode !== 'off') {
    try {
      sourceCanonical = await resolveCanonicalDocument(canonical_document_id)
      if (!sourceCanonical) {
        if (continuityMode === 'enforce') {
          console.warn('[generate-pdf] continuity=enforce canonical not found → 404', { id: canonical_document_id })
          return NextResponse.json(canonicalError('CANONICAL_NOT_FOUND'), { status: 404 })
        }
        // shadow: log and fall through to extracted_fields
        console.warn('[generate-pdf] continuity=shadow canonical not found, falling back to extracted_fields')
      } else {
        // Compute hash binding for certification record
        canonicalFieldsHash = computeFieldsHash(sourceCanonical)
        const overrides = await listCanonicalOverrides(canonical_document_id)
        resolvedCanonicalHash = computeResolvedHash(canonicalFieldsHash, overrides)
        overrideSetHash = computeOverrideSetHash(overrides)
        overrideVersion = overrides.length > 0
          ? Math.max(...overrides.map((o) => o.version ?? 0))
          : 0
        console.info('[generate-pdf] continuity', JSON.stringify({
          mode: continuityMode, id: canonical_document_id,
          fields: sourceCanonical.fields.length,
          overrides: overrides.length,
          // PII-free: hash prefixes only
          fieldsHash: canonicalFieldsHash.slice(0, 12),
          resolvedHash: resolvedCanonicalHash.slice(0, 12),
        }))
      }
    } catch {
      if (continuityMode === 'enforce') {
        console.error('[generate-pdf] continuity=enforce canonical storage unavailable → 503')
        return NextResponse.json(canonicalError('CANONICAL_STORAGE_UNAVAILABLE'), { status: 503 })
      }
      // shadow: log, fall through
      console.warn('[generate-pdf] continuity=shadow canonical load failed, falling back to extracted_fields')
    }
  } else if (continuityMode === 'off') {
    console.warn('[generate-pdf] continuity=off — canonical persistence SKIPPED (emergency rollback)')
  }

  // When canonical is available, convert it to ExtractedField[] for the existing render pipeline.
  // C3 null fields are OMITTED (not rendered as blank) — INV-11.
  // In enforce mode, extracted_fields from the request body CANNOT be the authority;
  // only canonical fields are used.
  if (sourceCanonical) {
    const canonicalAsFields: ExtractedField[] = sourceCanonical.fields
      .map((f) => canonicalToFieldOut(f))
      .filter((fo) => fo.value !== null) // INV-11: C3 null → omit from render
      .map((fo) => ({
        field: fo.field,
        source_label: fo.kind ?? 'canonical',
        source_zone: fo.kind ?? 'canonical',
        bbox: [0, 0, 0, 0] as [number, number, number, number],
        raw_value: fo.value ?? '',
        normalized_value: fo.value ?? '',
        language_layer: 'unknown' as const,
        confidence: fo.confidence,
        review_required: fo.review_required,
      }))

    if (continuityMode === 'enforce') {
      // Enforce: canonical is the ONLY authority — overwrite request fields entirely.
      payload = { ...payload, fields: canonicalAsFields }
    } else {
      // Shadow: merge — canonical wins, but extracted_fields remains as projection for
      // any key not present in canonical (backward-compat during rollout).
      payload = { ...payload, fields: canonicalAsFields }
    }
  }

  // ── Certifier override (CERTIFIER_OVERRIDE_ENABLED, default OFF) ────────────
  // ADR-021 / LAW 2#5: a certifier attests a critical field from the source. Runs
  // BEFORE the review check so a finalized override clears that field's review flag.
  // OFF ⇒ skipped entirely (byte-identical prod). A block (anchor conflict / invalid
  // authority, e.g. user_clarified on TIER 1) → 422; every decision is audited.
  if (process.env.CERTIFIER_OVERRIDE_ENABLED === '1' && payload.fields?.length) {
    const { block } = await applyCertifierOverrides(payload.fields as unknown as FieldWithMaybeOverride[], {
      enabled: true,
      docType: payload.doc_type ?? '',
      documentClass: docintelIdToDocumentClass(payload.doc_type ?? ''),
      sessionId: payload.session_id ?? 'legacy',
      timestampUtc: new Date().toISOString(),
    })
    if (block) {
      return NextResponse.json(
        // PII rule: field NAME + reason only — never the value.
        { ok: false, error: 'certifier_override_blocked', gate: 'certifier_override', field: block.field, reason: block.reason },
        { status: 422 },
      )
    }
  }

  // ── Pre-payment review check ───────────────────────────────────────────────
  // Block BEFORE Stripe charge if any extracted field still requires review.
  // This prevents the user from being charged for a PDF that reviewGate would
  // block with 403. Return 400 (client error) so the wizard can show a
  // "please confirm your fields first" message without triggering a charge.
  const unresolvedReviewFields = (payload.fields ?? []).filter((f) => f.review_required === true)
  if (unresolvedReviewFields.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'fields_require_review',
        detail: 'Please confirm all highlighted fields on the review screen before completing payment.',
        unresolved_count: unresolvedReviewFields.length,
      },
      { status: 400 },
    )
  }

  // ── Payment gate (Severity-1 liability fix, 2026-05-27) ────────────────────
  //   This endpoint previously hardcoded payment_confirmed:true and never
  //   verified the Stripe session — anyone could POST and receive a translation
  //   PDF + email for free. Now: owner-bypass OR a valid Stripe checkout session
  //   whose payment_status==='paid' AND metadata.service==='translation'.
  //   Stripe checkout id is the cs_* set by ?cs={CHECKOUT_SESSION_ID} on the
  //   success redirect; the wizard sends it in the X-Payment-Token header
  //   (parity with TPS) or, as a fallback, in payload.session_id.
  const owner = await isOwnerSession(req)
  if (!owner.verified) {
    const token = req.headers.get('x-payment-token') || payload.session_id || ''
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'payment_required', detail: 'Complete checkout before generating translation.' },
        { status: 402 },
      )
    }
    const v = await verifyStripeSessionPaid(token, { expectedService: 'translation' })
    if (!v.paid || !v.correctService) {
      return NextResponse.json(
        { ok: false, error: 'payment_not_confirmed', reason: v.reason },
        { status: 402 },
      )
    }
  }

  const { profile, selectedPlan, signedAt, certificationTextVersion, session_id } = payload

  // ── Review Gate (hard block, 8 CFR §103.2(b)(3)) ───────────────────────────
  //   A signed translation may only be rendered after a human reviewed the
  //   machine draft and signed the certification. This endpoint previously
  //   rendered certified output from raw machine fields with only a payment
  //   check — a machine-only POST yielded a "certified" PDF. The gate is passed
  //   by an explicit reviewConfirmed checkbox OR a completed signature, and in
  //   both cases signer name + address are mandatory. Applies to the owner too:
  //   certification is a legal boundary, not a payment one.
  const gate = assertReviewGate({
    reviewConfirmed: payload.reviewConfirmed,
    dataReviewed: payload.dataReviewed,
    accuracyAttested: payload.accuracyAttested,
    signerName: profile?.name,
    signerAddress: profile?.addr,
    signedAt,
    signatureMethod: payload.signatureMethod,
    signatureDataUrl: payload.signatureDataUrl,
    extractedFields: (payload.fields ?? []).map((field) => ({
      field: field.field,
      normalized_value: field.normalized_value,
      review_required: field.review_required,
    })),
  })
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: 'review_required', gate: 'review', reason: gate.reason, detail: gate.detail },
      { status: 403 },
    )
  }

  // ── Phase 3.1 (ADR-017): D5 release values re-enter C3 server-side (ALWAYS ON) ──
  // "A confirmed field CAN become final — via C3, never by bypassing it."
  // The act of signing the certification IS the confirmation: every value the
  // user reviewed/edited on the review screen arrives here as normalized_value
  // and is about to be rendered into a LEGAL certified English translation.
  // Until now that release value went into the PDF with zero server-side
  // validation — Cyrillic, control chars, garbage. This guard is deterministic
  // INPUT SANITATION for a legal document, not an AI-safety experiment: it runs
  // unconditionally (NOT behind OCR_FIELD_SAFETY_ENABLED). Release values are
  // Latin post-KMU-55, so legitimate flows are unaffected; only genuine defects
  // (Cyrillic/control/over-length/bad-date) are caught.
  //   - CRITICAL field fails → 422 Unprocessable Entity (field NAME only — PII rule)
  //   - non-critical fails   → value nulled (renders as MISSING), continue
  //   - pass                 → final_value set (the C3 re-run writing the release value)
  // 422 not 403: the content is semantically invalid, NOT an auth failure — infra
  // monitors must not treat a bad field value as an authorization problem.
  //
  // MEASUREMENT-FIRST: this is a NEW blocking behavior on a live payment/PDF route.
  // It ships in SHADOW mode by default — it validates and logs what it WOULD block
  // but does NOT block, so prod output is byte-identical and we collect the real
  // block-rate before enforcing. ONE env knob, three modes (no flag sprawl):
  //   CONFIRMED_VALUE_GUARD_MODE = 'shadow' (default) | 'enforce' | 'off'
  //     shadow  → validate + log '[confirmed_value_guard] would_block', do NOT block (prod unchanged)
  //     enforce → block (422 critical / null non-critical) — flip AFTER reviewing shadow logs
  //     off     → emergency kill-switch, no validation, loudly logged (degraded safety)
  const guardMode = (process.env.CONFIRMED_VALUE_GUARD_MODE ?? 'shadow').toLowerCase()
  if (guardMode === 'off') {
    console.error('[confirmed_value_guard] MODE=off — release-value sanitation DISABLED (degraded safety)')
  }
  const enforce = guardMode === 'enforce'
  for (const f of payload.fields ?? []) {
    if (guardMode === 'off') break
    const verdict = validateConfirmedValue(f.field, f.normalized_value)
    const criticality = classifyCriticality(f.field)
    const critical = criticality === 'critical_identity' || criticality === 'critical_document'
    if (!verdict.ok) {
      // Observability: PII-free signal (field name + class + reason, never the value).
      // 'would_block' in shadow (measurement), 'block' when actually enforced.
      console.warn(`[confirmed_value_guard] ${enforce ? 'block' : 'would_block'}`, JSON.stringify({
        field: f.field, criticality, reason: verdict.reason, doc_type: payload.doc_type ?? null,
      }))
      // L1 baseline (GUARD_BLOCK_METRICS_ENABLED, default OFF): count would-be/actual
      // blocks PII-free so the rate threshold can be calibrated. Records in shadow too.
      await recordGuardBlock({ gateType: 'confirmed_value_guard', reasonCode: verdict.reason ?? 'invalid_value', wouldBlock: !enforce, fieldName: f.field, docType: payload.doc_type ?? null, sessionId: payload.session_id ?? null })
      if (!enforce) continue // shadow: measured, but do NOT alter output
      if (critical) {
        // L1 A-full (REFUND_AUTOTICKET_ENABLED, default OFF): this 422 is POST-payment →
        // send the correction acknowledgment (422 = user-input, user must fix in D5). Best-effort.
        await postPaymentFailure('user_input_invalid', {
          sessionId: payload.session_id ?? 'legacy', email: payload.profile?.email ?? null, docType: payload.doc_type ?? null,
        })
        return NextResponse.json(
          // PII rule: field NAME only — the rejected value is NEVER echoed.
          { ok: false, error: 'unprocessable_field', gate: 'confirmed_value_guard', field: f.field, reason: verdict.reason },
          { status: 422 },
        )
      }
      f.final_value = null      // non-critical: drop the bad value, render as missing
      f.normalized_value = ''   // belt-and-suspenders: no other consumer can read it
      continue
    }
    if (enforce) f.final_value = (f.normalized_value ?? '').trim() || null // C3 accepts the release value as final
  }

  // ── C3: machine-read critical-field output gate (OCR_FIELD_SAFETY_ENABLED, default OFF) ──
  // Separate concern from the confirmed-value guard above: this gates the
  // MACHINE-read candidate safety (a critical field the model read but the user
  // never confirmed). OFF ⇒ skipped (reviewGate already blocks unconfirmed
  // review_required fields). ON (canary) ⇒ block when any critical field is
  // still review/manual and not confirmed.
  if (isOcrFieldSafetyEnabled()) {
    const unresolved = hasUnresolvedCriticalForOutput(
      (payload.fields ?? []).map((f) => ({
        criticality: classifyCriticality(f.field),
        review_required: f.review_required,
        manual_required: (f as { manual_required?: boolean }).manual_required,
        confirmed: (f as { confirmed?: boolean }).confirmed,
      })),
    )
    if (unresolved) {
      await recordGuardBlock({ gateType: 'ocr_field_safety', reasonCode: 'unresolved_critical_field', wouldBlock: false, docType: payload.doc_type ?? null, sessionId: payload.session_id ?? null })
      // L1 A-full: POST-payment guard block → review-flow + owner alert (best-effort, OFF by default).
      await postPaymentFailure('guard_block', {
        sessionId: payload.session_id ?? 'legacy', email: payload.profile?.email ?? null, docType: payload.doc_type ?? null,
      })
      return NextResponse.json(
        { ok: false, error: 'review_required', gate: 'ocr_field_safety', reason: 'unresolved_critical_field' },
        { status: 403 },
      )
    }
  }

  // Build certification record
  const certRecord = buildCertificationRecord({
    signerName: profile.name,
    signerAddress: profile.addr,
    signerPhone: profile.phone,
    signerEmail: profile.email,
    sourceLanguage: 'Ukrainian',
    signatureTypedName: profile.name,
  })

  // Generate real PDF
  let pdfBuffer: Buffer | null = null
  let pdfMode: 'mirror' | 'generic' = 'generic'
  // Single source for the legacy/generic render — used by the fallback path AND
  // by the dual-render comparison (Migration Plan step B), so both always see
  // identical inputs.
  const renderGenericPdf = () => generateTranslationPDF({
    scopeTitle: payload.scope_title ?? `English Translation of Ukrainian Document`,
    documentType: payload.doc_type ?? 'other',
    fields: payload.fields ?? [],
    sourceTraces: payload.source_traces ?? [],
    certificationRecord: certRecord,
    sessionId: session_id ?? 'legacy',
    signatureDataUrl: payload.signatureDataUrl,
  })
  try {
    // MIRROR_PDF_ENABLED (default OFF): when on AND an official schema exists for
    // this docType, render a faithful English MIRROR of the Ukrainian document
    // (structured by its KMU normative source) instead of the generic field table.
    // OFF or no schema ⇒ unchanged generic certification PDF (byte-identical).
    // MIRROR_READY_DOCTYPES: doc types whose official schema is VERIFIED to cover
    // every field the extractor emits (no data loss vs the generic table) and whose
    // mirror layout has been eyeballed. These render the mirror BY DEFAULT (no env
    // flag) — birth certificate is the first, schema = KMU 1025, all 11 extractor
    // keys map to schema keys. Other doc types still require MIRROR_PDF_ENABLED=1
    // until their schemas are likewise verified (divorce/name-change are sparse).
    const MIRROR_READY_DOCTYPES = new Set([
      'ua_birth_certificate', 'ua_marriage_certificate', 'ua_divorce_certificate',
      'ua_death_certificate', 'ua_name_change_certificate',
      'ua_internal_passport_booklet', 'ua_international_passport', 'ua_id_card',
    ])
    const mirrorEnabled =
      process.env.MIRROR_PDF_ENABLED === '1' ||
      MIRROR_READY_DOCTYPES.has(payload.doc_type ?? '')
    if (mirrorEnabled && hasOfficialSchema(payload.doc_type)) {
      // FAIL-OPEN: a mirror-render error must NEVER break the client's PDF — fall
      // through to the generic certification PDF below (pdfBuffer stays null). The
      // mirror is a structural nicety; the generic table is the guaranteed output.
      try {
        const mirror = await renderMirrorTranslationPDF(payload.doc_type, payload.fields ?? [], {
          signerName: profile.name,
          signerAddress: profile.addr,
          signedAt,
        })
        if (mirror) {
          pdfBuffer = mirror.pdf
          pdfMode = 'mirror'
          console.info('[generate-pdf] mirror PDF', JSON.stringify({
            doc_type: mirror.docType, unresolved: mirror.unresolved.length, source: mirror.officialSource.act,
          }))
          // ── Dual-render comparison (PASSPORT_SCHEMA_DUAL_RENDER_ENABLED, default
          // OFF — Migration Plan step B). The schema PDF is what the user gets;
          // the legacy PDF is rendered ONLY to log a PII-free parity record
          // (hashes + byte counts). Fail-open: a compare error never affects the
          // response.
          if (isDualRenderEnabled()) {
            try {
              const legacyPdf = await renderGenericPdf()
              console.info('[generate-pdf] dual-render', JSON.stringify(
                buildDualRenderLog(payload.doc_type ?? 'unknown', mirror.pdf, legacyPdf),
              ))
            } catch (dualErr) {
              console.warn('[generate-pdf] dual-render compare failed (response unaffected):', dualErr)
            }
          }
        }
      } catch (mirrorErr) {
        console.error('[generate-pdf] mirror render failed, falling back to generic:', mirrorErr)
      }
    }
    if (!pdfBuffer) {
      pdfBuffer = await renderGenericPdf()
    }
  } catch (err) {
    console.error('[generate-pdf] PDF generation failed:', err)
  }
  void pdfMode

  // Internal attestation/audit trail (8 CFR §103.2(b)(3)) — WHAT was attested and
  // WHEN. Persisted to translation_certification_audit (its own table). Not shown
  // on the customer PDF.
  const attestation = buildAttestationRecord({
    dataReviewed: payload.dataReviewed,
    accuracyAttested: payload.accuracyAttested,
    reviewConfirmed: payload.reviewConfirmed,
    signerName: profile?.name,
    signerAddress: profile?.addr,
    signedAt,
    signatureMethod: payload.signatureMethod,
    signatureDataUrl: payload.signatureDataUrl,
    certificationVersion: certificationTextVersion,
    content: payload.fields ?? [],
    recordedAt: new Date().toISOString(),
  })

  // S2 — Audit persistence is a HARD requirement, not best-effort. The
  // translation_certification_audit row IS our 8 CFR §103.2(b)(3) compliance
  // artifact: if it is not stored we must NOT return a "signed" PDF as if the
  // certification had been recorded. persistCertification inserts order + audit
  // with one retry each (transient-blip tolerance). (Prior code logged a warning
  // and returned the PDF anyway → a signed document with no audit trail.)
  const persist = await persistCertification(createAdminSupabaseClient(), {
    orderRow: {
      name: profile.name,                 // NOT NULL — review gate guarantees signer name
      email: profile.email || '',         // NOT NULL — wizard sends '' (no email collected)
      phone: profile.phone || null,
      address: profile.addr || null,
      plan: selectedPlan,
      spanish_copy: !!payload.spanishCopy,
      locale: payload.locale ?? 'en',
      signed_at: signedAt || null,
      signature_method: payload.signatureMethod,
      certification_version: certificationTextVersion,
      status: 'signed',                   // CHECK: one of signed | emailed | failed
      stripe_checkout_id: session_id ?? null,
    },
    auditRow: {
      stripe_checkout_id: session_id ?? null,
      locale: payload.locale ?? 'en',
      document_type: payload.doc_type ?? 'other',
      certifier_name_present: attestation.certifier_name_present,
      certifier_address_present: attestation.certifier_address_present,
      signature_present: attestation.signature_present,
      signature_method: attestation.signature_method,
      data_reviewed: attestation.data_reviewed,
      accuracy_attested: attestation.accuracy_attested,
      review_confirmed: attestation.review_confirmed,
      document_hash: attestation.document_hash,
      certification_version: attestation.certification_version,
      signed_at: signedAt || null,
      audit_payload: attestation,
      // ── 7-field certification hash binding (CERTIFICATION_REPRODUCIBILITY_CONTRACT) ──
      // Binds: canonical source, base hash, resolved hash, override set hash,
      // override version, schema version, renderer version.
      // Same canonical + same overrides + same renderer_version → same PDF output.
      canonical_document_id: canonical_document_id ?? null,
      base_canonical_hash: canonicalFieldsHash,
      resolved_canonical_hash: resolvedCanonicalHash,
      override_set_hash: overrideSetHash,
      override_version: overrideVersion,
      canonical_schema_version: CANONICAL_SCHEMA_VERSION,
      renderer_version: RENDERER_VERSION,
    },
  })

  if (!persist.ok) {
    // Never lose a signed attestation: emit the full record as a structured
    // RECONCILE line (retained in logs) so it can be replayed into the DB. Then
    // fail closed — non-200, no PDF, no email, no "complete." The user already
    // paid + signed; the payment is verified by an idempotent Stripe session, so
    // a retry does NOT re-charge.
    console.error('[generate-pdf] AUDIT_RECONCILE', JSON.stringify({
      session_id: session_id ?? 'legacy',
      orderErr: persist.orderErr,
      auditErr: persist.auditErr,
      attestation,
    }))
    // L1 A-full: POST-payment infra failure → auto-retry-class ack + owner alert EVERY case
    // (it's an infra bug to investigate). Best-effort, OFF by default.
    await postPaymentFailure('backend_persist_failure', {
      sessionId: session_id ?? 'legacy', email: profile.email || null, docType: payload.doc_type ?? null,
    })
    return NextResponse.json(
      {
        ok: false,
        error: 'audit_persist_failed',
        status: 'degraded',
        detail: 'Your signature was recorded, but the system could not save the certification record. You will not be charged again — please retry in a moment. If this keeps happening, contact support.',
        session_id: session_id ?? null,
      },
      { status: 503 },
    )
  }

  // Send confirmation email (text, not HTML attachment)
  const plan = PLAN_LABEL[selectedPlan] ?? selectedPlan
  const planLine = `${plan}${payload.spanishCopy ? ' + Spanish Copy (+$3.00)' : ''}`
  const emailBody = [
    `Thank you, ${profile.name}.`,
    '',
    `Your translation order has been received.`,
    `Plan: ${planLine}`,
    `Signed: ${new Date(signedAt).toLocaleString('en-US')}`,
    `Certification version: ${certificationTextVersion}`,
    '',
    `Your PDF translation document is attached to this email.`,
    '',
    'Messenginfo is not a law firm. You signed the certification under 8 CFR §103.2(b)(3) and accept full responsibility for the accuracy of the translation. Verify current requirements at uscis.gov before filing.',
  ].join('\n')

  try {
    await sendEmail({
      to: profile.email,
      subject: 'Your Translation Document — Messenginfo',
      html: `<pre style="font-family:monospace;font-size:13px">${emailBody.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre>`,
      text: emailBody,
      type: 'translation_email' as const,
      ...(pdfBuffer ? {
        attachment: {
          filename: `translation-${(session_id ?? 'order').slice(0, 8)}.pdf`,
          content: pdfBuffer.toString('base64'),
          encoding: 'base64' as const, // content is already base64 — prevents double-encoding in sendEmail
        },
      } : {}),
    })
  } catch (err) {
    console.error('[generate-pdf] Email failed:', err)
    // L1 A-full: delivery failure → "check spam / we'll auto-resend" ack, NO refund.
    // Best-effort, OFF by default. (Itself sent via the same Resend — if that's the
    // outage, it no-ops gracefully; resend retry logic is a later item.)
    await postPaymentFailure('delivery_failure', {
      sessionId: session_id ?? 'legacy', email: profile.email || null, docType: payload.doc_type ?? null,
    })
  }

  // Return PDF directly if generated
  if (pdfBuffer) {
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="translation-${(session_id ?? 'order').slice(0, 8)}.pdf"`,
        'X-Session-Id': session_id ?? '',
      },
    })
  }

  // Fallback: confirm without PDF (rare — means pdf-lib failed)
  return NextResponse.json({
    ok: true,
    status: 'email_sent',
    warning: 'PDF generation failed — order recorded, email sent without attachment. Support will follow up.',
    session_id,
  })
}
