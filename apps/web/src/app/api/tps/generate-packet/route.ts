/**
 * POST /api/tps/generate-packet
 *
 * Body: TPSAnswers (see lib/tps/answers.ts)
 * Returns: application/zip containing I-821.pdf, I-765.pdf (if requested),
 * and README.txt with instructions.
 *
 * This route does NOT submit anything to USCIS. It does NOT determine
 * eligibility. It takes the user's typed data and produces a draft packet
 * for the user to review, sign, and file themselves.
 *
 * Rate limit: 10 packet generations per 5 minutes per IP — generous enough
 * for legitimate iteration, low enough to discourage abuse.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { getCanonicalMode } from '@/lib/canonical/continuityMode'
import { isMinimallyComplete, type TPSAnswers, defaultEadCategoryFor } from '@/lib/tps/answers'
import { buildPacket, type TranslationOptions } from '@/lib/tps/packetBuilder'
import type { ProvenanceMap } from '@/lib/tps/provenance'
import { checkReviewPayloadParity, type ReviewSnapshot } from '@/lib/tps/reviewParity'
import { requirePaidPacket } from '@/lib/stripe/requirePaidPacket'
// CANONICAL_CONTINUITY: packet route loads persisted canonical (shadow/enforce modes)
import type { CanonicalDocumentResult } from '@/lib/canonical/types'
import {
  resolveCanonicalDocument,
  verifyCanonicalHash,
} from '@/lib/canonical/persistence'
import { canonicalError } from '@/lib/canonical/persistence/errors'
import { buildI821DocumentOps } from '@/lib/canonical/forms/i821DocumentMapper'
import { i821DocumentFactsToCanonical } from '@/lib/tps/forms/i821DocumentBoundary'

// R1A Phase 6 — pre-PDF firewall.
// Final safety net BEFORE pdf-lib touches anything. Three checks:
//   1) No Cyrillic in fields that USCIS expects in Latin. KMU-55
//      transliteration happens upstream; if any Cyrillic slipped through
//      it's a bug and we refuse to render it into a PDF the user would
//      sign and mail to a federal agency.
//   2) Dates are in USCIS MM/DD/YYYY format (or empty). Anything else
//      is rejected — better to ask the user to correct than to write a
//      malformed date into an I-821 field.
//   3) A-number is digits-only (7–9). The I-821 / I-765 A-number fields
//      do not accept dashes or letters.
const HAS_CYRILLIC = /[Ѐ-ӿ]/
// Accept the two canonical date shapes:
//   USCIS canonical  MM/DD/YYYY      (what the UI normalizes to)
//   ISO              YYYY-MM-DD      (used by some fixtures + future API clients)
// Both are unambiguous; packetBuilder normalizes to USCIS form before writing
// to pdf-lib. Anything else is a bug upstream and rejected here.
const VALID_DATE = /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/
const LATIN_REQUIRED_FIELDS: ReadonlyArray<keyof TPSAnswers> = [
  'family_name', 'given_name', 'middle_name',
  'us_address_street', 'us_address_city', 'us_address_state', 'us_address_zip',
  'passport_number', 'passport_country_of_issuance',
  'country_of_birth', 'country_of_nationality',
  'i94_admission_number',
  'a_number',
] as const
const DATE_FIELDS: ReadonlyArray<keyof TPSAnswers> = [
  'dob', 'passport_expiration_date', 'last_entry_date',
] as const

interface FirewallIssue {
  field: string
  reason: string
}

function preflightAudit(answers: TPSAnswers): FirewallIssue[] {
  const issues: FirewallIssue[] = []
  for (const k of LATIN_REQUIRED_FIELDS) {
    const v = answers[k]
    if (typeof v === 'string' && v && HAS_CYRILLIC.test(v)) {
      issues.push({ field: k, reason: 'cyrillic_in_pdf_bound_field' })
    }
  }
  for (const k of DATE_FIELDS) {
    const v = answers[k]
    if (typeof v === 'string' && v && !VALID_DATE.test(v)) {
      issues.push({ field: k, reason: 'date_not_mm_dd_yyyy_or_iso' })
    }
  }
  const a = answers.a_number
  if (typeof a === 'string' && a) {
    const digits = a.replace(/\D/g, '')
    if (a !== digits) {
      issues.push({ field: 'a_number', reason: 'a_number_must_be_digits_only' })
    } else if (digits.length < 7 || digits.length > 9) {
      issues.push({ field: 'a_number', reason: 'a_number_digit_count_out_of_range' })
    }
  }
  return issues
}

// Run on the Node runtime (filesystem + pdf-lib + jszip need full Node).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // ── Server-side entitlement check ──────────────────────────────────────
  // Owner bypasses payment; everyone else must present a Stripe-verified,
  // product-matched, unconsumed token. This prevents paywall bypass via direct
  // API call or back-navigation.
  //
  // SECURITY (#184 E5): use the SHARED fail-closed gate (same as reparole + ead).
  // The previous TPS-local check fell OPEN — a junk token (not cs_/py_), missing
  // Stripe config, or any retrieve() error fell through to generation, a full
  // payment bypass. requirePaidPacket fails closed on every one of those.
  const gate = await requirePaidPacket({ req, product: 'tps-ukraine' })
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'Payment required to generate packet.', reason: gate.code },
      { status: gate.status },
    )
  }

  const ip = getClientIP(req)
  const rl = await rateLimit(`tps-generate:${ip}`, 10, 5 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Body must be a TPSAnswers object' }, { status: 400 })
  }

  // Phase 2: extract provenance sidecar (optional, backward-compatible).
  // The wizard sends { ...answers, _provenance: ProvenanceMap }.
  // Strip _provenance from the answers object before validation.
  const rawBody = body as Record<string, unknown>
  const provenance: ProvenanceMap | null =
    rawBody._provenance && typeof rawBody._provenance === 'object'
      ? (rawBody._provenance as ProvenanceMap)
      : null
  delete rawBody._provenance

  // ADR-006: extract translation sidecar (optional, backward-compatible).
  const translationOpts: TranslationOptions | null =
    rawBody._translation && typeof rawBody._translation === 'object'
      ? (rawBody._translation as TranslationOptions)
      : null
  delete rawBody._translation

  const reviewSnapshot: ReviewSnapshot | null =
    rawBody._review_snapshot && typeof rawBody._review_snapshot === 'object'
      ? (rawBody._review_snapshot as ReviewSnapshot)
      : null
  delete rawBody._review_snapshot

  // Normalize: fill ead_category from filing_path if missing.
  const answers = rawBody as unknown as TPSAnswers
  if (answers.wants_ead && !answers.ead_category) {
    answers.ead_category = defaultEadCategoryFor(answers.filing_path)
  }

  const check = isMinimallyComplete(answers)
  if (!check.ok) {
    return NextResponse.json(
      { error: 'Missing required fields', missing: check.missing },
      { status: 422 },
    )
  }

  // Runtime parity lock (wave1):
  // values shown to user on Step 5 must match values sent to packet generation.
  const reviewPayloadMismatches = checkReviewPayloadParity(answers, reviewSnapshot)
  if (reviewPayloadMismatches.length > 0) {
    return NextResponse.json(
      {
        error: 'Review-to-payload parity mismatch',
        reason: 'review_payload_parity_mismatch',
        mismatches: reviewPayloadMismatches,
        guidance: 'Refresh review step and regenerate. Do not proceed with mismatched birth-place fields.',
      },
      { status: 422 },
    )
  }

  // R1A Phase 6: pre-PDF firewall. Stop unsafe values from reaching
  // pdf-lib. The wizard already filters at the UI layer and the OCR
  // route already filters by slot contract — this is the last line.
  const audit = preflightAudit(answers)
  if (audit.length > 0) {
    return NextResponse.json(
      {
        error: 'PDF safety check failed',
        issues: audit,
        guidance: 'Please correct the listed fields on the review screen before generating the packet.',
      },
      { status: 422 },
    )
  }

  // ── CANONICAL_CONTINUITY: load resolved canonical if available ──────────────
  const mode = getCanonicalMode('tps')
  const canonical_document_id = answers.canonical_document_id ?? null
  // Remove from answers so it doesn't bleed into legacy processing
  delete (answers as unknown as Record<string, unknown>).canonical_document_id

  let documentCanonical: CanonicalDocumentResult | null = null

  if (mode === 'enforce' && !canonical_document_id) {
    return NextResponse.json(
      canonicalError('CANONICAL_ID_REQUIRED', 'canonical_document_id required in enforce mode'),
      { status: 422 },
    )
  }

  if (canonical_document_id && mode !== 'off') {
    // Verify hash integrity first.
    // NOT-FOUND vs INFRA vs MISMATCH: verifyCanonicalHash returns notFound:true for a
    // missing row (→404), THROWS on a real storage error (→503), and returns
    // mismatch for a genuine hash conflict (→409). A missing id must NOT be reported
    // as a 409 hash mismatch or a 503.
    let hashCheck: { valid: boolean; mismatch?: string; notFound?: boolean }
    try {
      hashCheck = await verifyCanonicalHash(canonical_document_id)
    } catch {
      if (mode === 'enforce') {
        return NextResponse.json(
          canonicalError('CANONICAL_STORAGE_UNAVAILABLE'),
          { status: 503 },
        )
      }
      console.warn('[canonical/continuity] tps-generate canonical_hash_verify_failed_shadow', {
        event: 'canonical_hash_verify_failed_shadow',
        canonical_document_id,
      })
      hashCheck = { valid: false }
    }

    if (hashCheck.notFound) {
      if (mode === 'enforce') {
        return NextResponse.json(canonicalError('CANONICAL_NOT_FOUND'), { status: 404 })
      }
      console.warn('[canonical/continuity] tps-generate canonical_not_found_shadow', {
        event: 'canonical_not_found_shadow',
        canonical_document_id,
      })
    } else if (!hashCheck.valid) {
      if (mode === 'enforce') {
        return NextResponse.json(
          canonicalError('CANONICAL_HASH_MISMATCH', hashCheck.mismatch),
          { status: 409 },
        )
      }
      console.warn('[canonical/continuity] tps-generate canonical_hash_mismatch_shadow', {
        event: 'canonical_hash_mismatch_shadow',
        canonical_document_id,
      })
    } else {
      try {
        documentCanonical = await resolveCanonicalDocument(canonical_document_id)
        if (!documentCanonical && mode === 'enforce') {
          return NextResponse.json(
            canonicalError('CANONICAL_NOT_FOUND'),
            { status: 404 },
          )
        }
        console.info('[canonical/continuity] tps-generate canonical_loaded', {
          event: 'canonical_loaded',
          canonical_document_id,
          fields: documentCanonical?.fields.length ?? 0,
        })
      } catch (err) {
        if (mode === 'enforce') {
          return NextResponse.json(
            canonicalError('CANONICAL_STORAGE_UNAVAILABLE'),
            { status: 503 },
          )
        }
        console.warn('[canonical/continuity] tps-generate canonical_load_failed_shadow', {
          event: 'canonical_load_failed_shadow',
          canonical_document_id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  // enforce mode invariant guard: if we reach here in enforce mode, documentCanonical MUST be set.
  // This line is unreachable in enforce mode if the above logic is correct, but guards for type safety.
  if (mode === 'enforce' && !documentCanonical) {
    return NextResponse.json(
      canonicalError('CANONICAL_NOT_READY', 'canonical document not available in enforce mode'),
      { status: 409 },
    )
  }
  // ── END CANONICAL_CONTINUITY ──────────────────────────────────────────────

  try {
    const result = await buildPacket(answers, provenance, translationOpts, documentCanonical)
    return new NextResponse(new Uint8Array(result.zipBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="tps-packet-draft.zip"',
        'Cache-Control': 'no-store',
        // Surface counts so the wizard can confirm visually what happened.
        'X-TPS-I821-Applied': String(result.i821.applied),
        'X-TPS-I821-Skipped': String(result.i821.skipped),
        'X-TPS-I821-First-Skip': result.i821.firstSkips[0] ?? '',
        'X-TPS-I765-Applied': String(result.i765.applied),
        'X-TPS-I765-Skipped': String(result.i765.skipped),
        'X-TPS-I765-First-Skip': result.i765.firstSkips[0] ?? '',
        'X-TPS-Translations': String(result.translations.length),
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'Generation failed', detail: msg }, { status: 500 })
  }
}
