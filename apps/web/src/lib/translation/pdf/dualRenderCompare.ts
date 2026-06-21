/**
 * dualRenderCompare — Migration Plan step B (dual-render observability).
 *
 * When PASSPORT_SCHEMA_DUAL_RENDER_ENABLED=1 AND the schema (mirror) path is
 * active, generate-pdf renders BOTH PDFs, returns the schema PDF to the user,
 * and logs this comparison record so the owner/mentor can verify parity before
 * widening the canary. PII rule: the log carries HASHES and byte counts ONLY —
 * never field values, names, or rendered text.
 *
 * `normalized_*` hashes strip the volatile PDF internals (/CreationDate,
 * /ModDate, /ID) so two renders of the SAME content compare equal across runs;
 * the raw hashes will differ on every render by design.
 */
import { createHash } from 'node:crypto'

export function isDualRenderEnabled(): boolean {
  return process.env.PASSPORT_SCHEMA_DUAL_RENDER_ENABLED === '1'
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16)
}

/** Strip volatile PDF metadata so content-identical renders hash identically. */
export function normalizePdfBytes(buf: Buffer): Buffer {
  const text = buf.toString('latin1')
  const stripped = text
    .replace(/\/CreationDate\s*\([^)]*\)/g, '/CreationDate(X)')
    .replace(/\/ModDate\s*\([^)]*\)/g, '/ModDate(X)')
    .replace(/\/ID\s*\[\s*<[0-9a-fA-F]*>\s*<[0-9a-fA-F]*>\s*\]/g, '/ID[<X><X>]')
  return Buffer.from(stripped, 'latin1')
}

export interface DualRenderLog {
  event: 'dual_render_compare'
  doc_type: string
  mirror_bytes: number
  legacy_bytes: number
  mirror_sha256: string
  legacy_sha256: string
  normalized_mirror_sha256: string
  normalized_legacy_sha256: string
  normalized_identical: boolean
}

/** Build the PII-free comparison record for the dual-render log line. */
export function buildDualRenderLog(
  docType: string,
  mirrorPdf: Buffer,
  legacyPdf: Buffer,
): DualRenderLog {
  const nm = sha256(normalizePdfBytes(mirrorPdf))
  const nl = sha256(normalizePdfBytes(legacyPdf))
  return {
    event: 'dual_render_compare',
    doc_type: docType,
    mirror_bytes: mirrorPdf.length,
    legacy_bytes: legacyPdf.length,
    mirror_sha256: sha256(mirrorPdf),
    legacy_sha256: sha256(legacyPdf),
    normalized_mirror_sha256: nm,
    normalized_legacy_sha256: nl,
    normalized_identical: nm === nl,
  }
}
