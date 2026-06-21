/**
 * formIntegrity — runtime guard against PDF-form replacement.
 *
 * Why this exists:
 *   The packet builder reads I-821 / I-765 / I-131 bytes from
 *   apps/web/public/uscis/tps/*.pdf at request time. The field maps in
 *   lib/tps/forms/* are pinned to specific USCIS editions (I-821
 *   01/20/25, I-765 08/21/25, I-131 01/20/25). If the on-disk PDFs are
 *   ever swapped — by a careless `refresh_tps_forms.sh` run that picks
 *   up a newer USCIS edition, or by an accidental commit of a tampered
 *   file — the field map will silently write into the wrong cells (or
 *   throw obscure pdf-lib errors) and the user gets a broken packet.
 *
 *   This module computes SHA256 of each PDF on first use and throws if
 *   it does not match the pinned hash. The existing vitest "forms
 *   manifest edition drift guard" catches edition-string drift; this
 *   adds binary-level drift detection at runtime.
 *
 *   Update procedure when USCIS publishes a new edition:
 *     1. Run scripts/refresh-tps-forms.sh (or manual qpdf normalize).
 *     2. Run scripts/compute-form-sha.sh — prints the new hashes.
 *     3. Update PINNED_HASHES below.
 *     4. Update field maps for the new edition.
 *     5. Update forms_manifest.json (snapshot SHA + edition).
 *     6. Run vitest — buildPacket tests must pass.
 *
 * Privacy:
 *   - No PII flows through this module. Hash is computed on bytes read
 *     from disk, not on user data.
 *
 * Performance:
 *   - We hash once per process and cache. Cost is single-digit
 *     milliseconds per PDF on first request, zero after that.
 */

import { createHash } from 'node:crypto'

/**
 * Pinned SHA256 of the runtime PDFs (qpdf-normalized, post-XFA strip).
 * Computed 2026-05-11. To refresh: see header comment.
 */
export const PINNED_HASHES: Record<string, string> = {
  'i-821.pdf':
    '44efaa06067eb78b024493bda388d17c214eb3bdbb204a516b0a1a1bf8521cda',
  'i-765.pdf':
    '52759f499dc7e49a65fabe33c509bf450929a39349a9b1bc270e79ffe386dedb',
  'i-912.pdf':
    '4c1fa04bb6b386fab7473de8968a1612d7faccd5361fd73ea001e4fc2816cd5b',
  'i-131.pdf':
    '86f832d4b58d8b5e81821bf51bfb5d5a132db135aa7d30b7e09eab9bbb10fb4d',
}

const verifiedKeys = new Set<string>()

/**
 * Compute SHA256 of a Buffer and compare against the pinned hash for
 * a given form key. Throws on mismatch. Idempotent — verifies once per
 * key per process lifetime.
 *
 * @param formKey   File name like 'i-821.pdf'. MUST be in PINNED_HASHES.
 * @param bytes     The PDF bytes about to be passed to pdf-lib.
 */
export function assertFormIntegrity(formKey: string, bytes: Uint8Array): void {
  if (verifiedKeys.has(formKey)) return
  const pinned = PINNED_HASHES[formKey]
  if (!pinned) {
    // Unknown form key — fail closed. Caller should add an entry to
    // PINNED_HASHES rather than skip the check.
    throw new Error(
      `[formIntegrity] No pinned hash registered for "${formKey}". ` +
        `Add it to PINNED_HASHES in lib/tps/formIntegrity.ts.`,
    )
  }
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== pinned) {
    throw new Error(
      `[formIntegrity] PDF tampered or replaced: ${formKey}. ` +
        `Expected SHA256 ${pinned} but read ${actual}. ` +
        `If USCIS published a new edition, update PINNED_HASHES and field maps together.`,
    )
  }
  verifiedKeys.add(formKey)
}

/**
 * Test helper — clears the verification cache so a subsequent call
 * re-checks the bytes. NEVER call from production code paths.
 */
export function _resetIntegrityCacheForTests(): void {
  verifiedKeys.clear()
}
