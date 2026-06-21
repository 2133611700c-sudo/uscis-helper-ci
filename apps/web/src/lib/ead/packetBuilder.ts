/**
 * EAD packet builder — EadFieldData → filled I-765.pdf bytes.
 *
 * Server-only (uses fs). Reads the official USCIS I-765 PDF from
 * apps/web/public/uscis/tps/i-765.pdf (same form used by TPS — the document is
 * identical regardless of which eligibility category fills it). Applies the
 * EAD-specific field map via the shared prefiller.
 *
 * No payment, no Stripe — EAD page is a free self-help wizard (see
 * /services/ead-work-permit/start/page.tsx docstring).
 *
 * CANONICAL_CONTINUITY: when a persisted CanonicalDocumentResult is provided,
 * document-derived fields (name, DOB, place of birth, etc.) come from the
 * canonical record via buildI765DocumentOps. Non-document fields (appType,
 * category, address) always come from EadFieldData. In off/shadow mode the
 * canonical is optional; in enforce mode it is required (enforced at the route
 * layer, not here).
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import type { EadFieldData } from './i765FieldMap'
import { buildEadI765Ops } from './i765FieldMap'
import { prefill } from '@/lib/tps/pdfPrefiller'
import { assertFormIntegrity } from '@/lib/tps/formIntegrity'
// CANONICAL_CONTINUITY: shared document-derived mapper (same entry point as TPS)
import type { CanonicalDocumentResult } from '@/lib/canonical/types'
import { buildI765DocumentOps } from '@/lib/canonical/forms/i765DocumentMapper'

const I765_EDITION = '08/21/25'

function pdfPath(): string {
  // Shared PDF asset — same form for TPS / EAD / asylum / etc.
  return path.join(process.cwd(), 'public', 'uscis', 'tps', 'i-765.pdf')
}

export interface EadPacketResult {
  pdfBytes: Uint8Array
  applied: number
  skipped: number
  firstSkips: string[]
  edition: string
}

/**
 * Build the EAD I-765 ops.
 *
 * CANONICAL PATH (documentCanonical != null):
 *   Document-derived fields (name, DOB, A-number, gender, country/city/province of birth,
 *   passport, I-94) come from buildI765DocumentOps(documentCanonical) — the ONE shared
 *   canonical entry point used by both TPS and EAD. EadFieldData is still used for
 *   non-document fields (appType, category, usAddress, Line 29).
 *
 * LEGACY FALLBACK (documentCanonical == null):
 *   LEGACY FALLBACK — allowed in off/shadow mode only. In enforce mode this path is
 *   unreachable (the route layer returns 409 before calling buildEadPacket).
 *   buildEadI765Ops(data) routes through eadDocumentFactsToCanonical → buildI765DocumentOps
 *   under the hood, so the same mapper is always the terminal writer.
 */
function buildOpsForEadPacket(
  data: EadFieldData,
  documentCanonical: CanonicalDocumentResult | null,
): ReturnType<typeof buildEadI765Ops> {
  if (documentCanonical) {
    // CANONICAL PATH: document-derived ops from persisted canonical
    const documentOps = buildI765DocumentOps(documentCanonical)

    // Non-document fields: re-use buildEadI765Ops but strip the document-derived
    // ops it would emit. We get those by calling it with an empty-document sentinel
    // and then appending the canonical document ops.
    // Simplest correct approach: call buildEadI765Ops with an EadFieldData stripped
    // of all document-derived fields, then prepend canonical ops.
    //
    // Application-layer fields (non-document) in EadFieldData:
    //   appType, category, usAddress
    // These are emitted by buildEadI765Ops at positions that do NOT overlap with
    // document ops. We can call buildEadI765Ops with a stub for document fields
    // and splice in the canonical document ops.
    const appLayerData: EadFieldData = {
      appType: data.appType,
      category: data.category,
      usAddress: data.usAddress,
      // Document fields blanked out — canonical provides these instead
      firstName: '',
      lastName: '',
      middleName: '',
      dob: '',
      countryOfBirth: '',
      alienNumber: '',
      gender: '',
    }
    const allOps = buildEadI765Ops(appLayerData)
    // Filter out any ops that overlap with canonical document field names
    const canonicalFields = new Set(documentOps.map((o) => o.field))
    const appOnlyOps = allOps.filter((o) => !canonicalFields.has(o.field))
    return [...documentOps, ...appOnlyOps]
  }

  // LEGACY FALLBACK — allowed in off/shadow mode only. In enforce mode this path
  // is unreachable (the route returns 409 before calling buildEadPacket).
  return buildEadI765Ops(data)
}

export async function buildEadPacket(
  data: EadFieldData,
  documentCanonical: CanonicalDocumentResult | null = null,
): Promise<EadPacketResult> {
  const pdfBytes = await fs.readFile(pdfPath())
  // PDF integrity check: hash must match the pinned SHA in formIntegrity, else
  // someone replaced the PDF without re-validating the field map → refuse.
  assertFormIntegrity('i-765.pdf', pdfBytes)

  const ops = buildOpsForEadPacket(data, documentCanonical)
  const result = await prefill(pdfBytes, ops, {
    edition: I765_EDITION,
    draftLabel: 'EAD DRAFT — review before signing',
  })

  return {
    pdfBytes: result.bytes,
    applied: result.applied,
    skipped: result.skipped.length,
    firstSkips: result.skipped.slice(0, 5).map((s) => `${s.field}: ${s.reason}`),
    edition: I765_EDITION,
  }
}
