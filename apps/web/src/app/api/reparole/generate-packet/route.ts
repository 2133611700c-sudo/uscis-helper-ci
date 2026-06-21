/**
 * POST /api/reparole/generate-packet
 *
 * Direct ReParoleAnswers → I-131 ZIP. Mirrors /api/tps/generate-packet
 * but uses the Re-Parole answers contract + I-131 form.
 *
 * Body: ReParoleAnswers JSON (lib/reparole/answers.ts).
 * Response: application/zip with I-131.pdf + README.txt
 *
 * Pre-PDF firewall is identical to TPS — no Cyrillic in PDF-bound
 * fields, dates must be MM/DD/YYYY or YYYY-MM-DD, a_number digits only.
 *
 * Rate limit: 10 packet generations per 5 minutes per IP.
 *
 * This route exists so the new ReparoleWizardV2 can ship without
 * dragging in the legacy WizardProvider / session_id stack used by
 * /api/packet/generate.
 */

import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { getCanonicalMode } from '@/lib/canonical/continuityMode'
import { requirePaidPacket } from '@/lib/stripe/requirePaidPacket'
import { REPAROLE_TIER1_PRICE_CENTS } from '@/lib/pricing'
import { buildReParoleI131 } from '@/lib/reparole/packetBuilder'
import type { ReParoleAnswers } from '@/lib/reparole/answers'
// CANONICAL_CONTINUITY: packet route loads persisted canonical (shadow/enforce modes)
import type { CanonicalDocumentResult } from '@/lib/canonical/types'
import {
  resolveCanonicalDocument,
  verifyCanonicalHash,
} from '@/lib/canonical/persistence'
import { canonicalError } from '@/lib/canonical/persistence/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HAS_CYRILLIC = /[Ѐ-ӿ]/
const VALID_DATE = /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/

const LATIN_REQUIRED: ReadonlyArray<keyof ReParoleAnswers> = [
  'family_name', 'given_name', 'middle_name',
  'mailing_street', 'mailing_city', 'mailing_state', 'mailing_zip',
  'physical_street', 'physical_city', 'physical_state', 'physical_zip',
  'a_number',
  'country_of_birth',
] as const

const DATE_FIELDS: ReadonlyArray<keyof ReParoleAnswers> = [
  'dob',
] as const

interface Issue { field: string; reason: string }

function preflightAudit(a: ReParoleAnswers): Issue[] {
  const issues: Issue[] = []
  for (const k of LATIN_REQUIRED) {
    const v = a[k]
    if (typeof v === 'string' && v && HAS_CYRILLIC.test(v)) {
      issues.push({ field: String(k), reason: 'cyrillic_in_pdf_bound_field' })
    }
  }
  for (const k of DATE_FIELDS) {
    const v = a[k]
    if (typeof v === 'string' && v && !VALID_DATE.test(v)) {
      issues.push({ field: String(k), reason: 'date_not_mm_dd_yyyy_or_iso' })
    }
  }
  const an = a.a_number
  if (typeof an === 'string' && an) {
    const digits = an.replace(/\D/g, '')
    if (an !== digits) {
      issues.push({ field: 'a_number', reason: 'a_number_must_be_digits_only' })
    } else if (digits.length < 7 || digits.length > 9) {
      issues.push({ field: 'a_number', reason: 'a_number_digit_count_out_of_range' })
    }
  }
  return issues
}

function minimallyComplete(a: ReParoleAnswers): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  const need: Array<keyof ReParoleAnswers> = [
    'family_name', 'given_name', 'dob',
    'mailing_street', 'mailing_city', 'mailing_state', 'mailing_zip',
    'country_of_birth',
  ]
  for (const k of need) {
    const v = a[k]
    if (v === undefined || v === null || v === '') missing.push(String(k))
  }
  return { ok: missing.length === 0, missing }
}

function readme(a: ReParoleAnswers): string {
  return `Re-Parole U4U packet — DRAFT for ${a.family_name}, ${a.given_name}.

This packet is a DRAFT prepared by Messenginfo for you to review,
sign, and file yourself with USCIS. Messenginfo is not a law firm
and does not submit your application.

WHAT'S IN THIS ZIP
  I-131.pdf       — pre-filled Form I-131 (edition 01/20/25)
  README.txt      — this file

NEXT STEPS
  1. Open I-131.pdf, review every field against your original
     documents. Correct anything that is wrong.
  2. Paper filing: handwrite "Ukraine RE-PAROLE" at the top of
     the first page, sign in BLACK ink. Online filing: transfer
     the values into my.uscis.gov, Box 10.C (U4U Ukraine).
  3. Do NOT file earlier than 180 days before your current parole
     expires. Early applications are rejected without refund.
  4. Parole filing fee: verify the current amount at
     uscis.gov/feecalculator. USCIS issues a separate invoice after
     conditional approval; fee is not waivable.

OFFICIAL SOURCES
  https://www.uscis.gov/i-131
  https://www.uscis.gov/humanitarian/uniting-for-ukraine
`
}

export async function POST(req: NextRequest) {
  // ── Server-side payment gate (fail-closed) ─────────────────────────────────
  // Before ANY packet generation. Owner sessions bypass (same mechanism as TPS);
  // everyone else must present a Stripe-verified, product-matched, correctly-priced,
  // unconsumed X-Payment-Token. Client paid=1 / body / query params are NEVER
  // authoritative. This closes the free-packet bypass (P1).
  const gate = await requirePaidPacket({
    req,
    product: 're-parole-u4u',
    expectedAmountCents: REPAROLE_TIER1_PRICE_CENTS,
  })
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'Payment required to generate packet.', reason: gate.code },
      { status: gate.status },
    )
  }

  const ip = getClientIP(req)
  const rl = await rateLimit(`reparole-generate:${ip}`, 10, 5 * 60_000)
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
    return NextResponse.json({ error: 'Body must be a ReParoleAnswers object' }, { status: 400 })
  }
  const answers = body as ReParoleAnswers

  const check = minimallyComplete(answers)
  if (!check.ok) {
    return NextResponse.json({ error: 'Missing required fields', missing: check.missing }, { status: 422 })
  }

  const audit = preflightAudit(answers)
  if (audit.length > 0) {
    return NextResponse.json(
      { error: 'PDF safety check failed', issues: audit,
        guidance: 'Please correct the listed fields on the review screen before generating the packet.' },
      { status: 422 },
    )
  }

  // ── CANONICAL_CONTINUITY: load resolved canonical if available ──────────────
  const mode = getCanonicalMode('reparole')
  const canonical_document_id = (answers as unknown as { canonical_document_id?: string }).canonical_document_id ?? null
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
    // NOT-FOUND vs INFRA vs MISMATCH: notFound:true → 404, throw → 503, mismatch → 409.
    // A missing id must NOT surface as a 409 hash mismatch or a 503.
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
      console.warn('[canonical/continuity] reparole-generate canonical_hash_verify_failed_shadow', {
        event: 'canonical_hash_verify_failed_shadow',
        canonical_document_id,
      })
      hashCheck = { valid: false }
    }

    if (hashCheck.notFound) {
      if (mode === 'enforce') {
        return NextResponse.json(canonicalError('CANONICAL_NOT_FOUND'), { status: 404 })
      }
      console.warn('[canonical/continuity] reparole-generate canonical_not_found_shadow', {
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
      console.warn('[canonical/continuity] reparole-generate canonical_hash_mismatch_shadow', {
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
        console.info('[canonical/continuity] reparole-generate canonical_loaded', {
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
        console.warn('[canonical/continuity] reparole-generate canonical_load_failed_shadow', {
          event: 'canonical_load_failed_shadow',
          canonical_document_id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  // enforce mode invariant guard: unreachable in enforce mode if above logic is correct.
  if (mode === 'enforce' && !documentCanonical) {
    return NextResponse.json(
      canonicalError('CANONICAL_NOT_READY', 'canonical document not available in enforce mode'),
      { status: 409 },
    )
  }
  // ── END CANONICAL_CONTINUITY ──────────────────────────────────────────────

  try {
    const result = await buildReParoleI131(answers, documentCanonical)
    const zip = new JSZip()
    zip.file('I-131.pdf', result.i131_bytes)
    zip.file('README.txt', readme(answers))
    const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    return new NextResponse(new Uint8Array(zipBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="reparole-packet-draft.zip"',
        'Cache-Control': 'no-store',
        'X-I131-Applied': String(result.i131.applied),
        'X-I131-Skipped': String(result.i131.skipped),
        'X-I131-First-Skip': result.i131.firstSkips[0] ?? '',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'Generation failed', detail: msg }, { status: 500 })
  }
}
