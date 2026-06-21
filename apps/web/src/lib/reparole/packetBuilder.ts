/**
 * Re-Parole packet builder — ReParoleAnswers → filled I-131.pdf + bytes.
 *
 * Server-only (uses fs). Reads the official USCIS I-131 PDF from
 * apps/web/public/uscis/reparole/i-131.pdf, applies the field map via
 * the shared pdfPrefiller (same engine as TPS), and returns the filled
 * PDF bytes plus a `applied` / `skipped` summary the caller can surface
 * in headers + README.
 *
 * Why the same prefiller as TPS:
 *   - Same Cyrillic → Latin transliteration safety net (KMU-55)
 *   - Same WinAnsi-safe text writing
 *   - Same DRAFT watermark + edition footer behavior
 *   - Same instanceof-based field-type detection (minify-safe)
 *
 * Privacy: this function is pure — input ReParoleAnswers, output bytes.
 * No DB writes. Caller (/api/packet/generate) decides whether to log
 * which form fields were applied for audit (counts only, no values).
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import type { ReParoleAnswers } from './answers'
import { buildI131Ops } from './i131FieldMap'
import { prefill } from '@/lib/tps/pdfPrefiller'
import { assertFormIntegrity } from '@/lib/tps/formIntegrity'
// CANONICAL_CONTINUITY: canonical path for document-derived ops
import type { CanonicalDocumentResult } from '@/lib/canonical/types'
import { buildI131DocumentOps } from '@/lib/canonical/forms/i131DocumentMapper'
import { i131DocumentFactsToCanonical } from './i131DocumentBoundary'

// Edition date verified against uscis.gov on 2026-05-11 and stamped on
// the PDF footer ("Form I-131 Edition 01/20/25"). If USCIS publishes a
// new edition, scripts/uscis/refresh_reparole_forms.sh should refresh
// and bump this constant in lockstep.
export const I131_EDITION = '01/20/25'

function publicPdfPath(name: string): string {
  return path.join(process.cwd(), 'public', 'uscis', 'reparole', name)
}

export interface ReParolePacketResult {
  i131_bytes: Uint8Array
  i131: { applied: number; skipped: number; firstSkips: string[] }
}

export async function buildReParoleI131(
  answers: ReParoleAnswers,
  /** CANONICAL_CONTINUITY: when provided, document-derived I-131 ops come from
   * the resolved canonical result instead of the legacy boundary conversion.
   * normalizeCountryOfBirth is NOT re-applied when using the canonical path
   * (normalization already ran at extraction time). */
  documentCanonical?: CanonicalDocumentResult | null,
): Promise<ReParolePacketResult> {
  const i131Bytes = await fs.readFile(publicPdfPath('i-131.pdf'))
  // CB.6 — Runtime integrity guard. Fails fast if the on-disk PDF was
  // replaced without updating PINNED_HASHES + field map together.
  assertFormIntegrity('i-131.pdf', i131Bytes)
  // CANONICAL_CONTINUITY: use resolved canonical if available (shadow/enforce modes),
  // else fall back to legacy boundary (LEGACY FALLBACK — allowed in off/shadow only.
  // In enforce mode this line is unreachable — the route guarantees documentCanonical).
  const i131DocumentOps = documentCanonical
    ? buildI131DocumentOps(documentCanonical)           // CANONICAL PATH (Part C: no re-normalization)
    : buildI131DocumentOps(i131DocumentFactsToCanonical(answers))  // LEGACY PATH
  const ops = documentCanonical
    ? (() => {
        // Merge: take all non-doc-derived ops from buildI131Ops, then prepend canonical doc ops.
        const allOps = buildI131Ops(answers)
        const docFieldNames = new Set(i131DocumentOps.map((op) => op.field))
        const userDeclaredOps = allOps.filter((op) => !docFieldNames.has(op.field))
        return [...i131DocumentOps, ...userDeclaredOps]
      })()
    : buildI131Ops(answers)

  const result = await prefill(new Uint8Array(i131Bytes), ops, {
    edition: I131_EDITION,
    draftLabel: 'I-131 DRAFT — Re-Parole U4U — review before signing',
  })

  return {
    i131_bytes: result.bytes,
    i131: {
      applied: result.applied,
      skipped: result.skipped.length,
      firstSkips: result.skipped.map((s) => `${s.field} (${s.reason})`).slice(0, 5),
    },
  }
}
