/**
 * Certification Record Validator — v5 §18 / §36 file-target.
 *
 * Thin re-export module that satisfies the v5 §36 file-target list.
 * The actual logic lives in `certificationRecord.ts` (which also exports
 * the canonical 8 CFR §103.2(b)(3) statement and CERTIFICATION_VERSION).
 *
 * v5 §36 expected:    /apps/web/lib/translation/certificationRecordValidator.ts
 * Repo location used: apps/web/src/lib/translation/certificationRecordValidator.ts
 *
 * Keeping the validator behind a stable name lets the QA gate orchestrator
 * import a single shape regardless of future re-shuffles.
 */

export {
  validateCertificationRecord,
  buildCertificationStatement,
  CERTIFICATION_VERSION,
  CERTIFICATION_STATEMENT,
} from './certificationRecord'

import { validateCertificationRecord, CERTIFICATION_VERSION } from './certificationRecord'
import type { CertificationRecord } from './types'

export interface CertificationRecordGateResult {
  ok: boolean
  errors: string[]
  /** True when the record's certification_version matches the current canonical version. */
  version_current: boolean
  passes: string[]
}

/**
 * Wraps the underlying validateCertificationRecord with the v5 gate
 * shape: also flags stale certification_version (helpful for future
 * regulatory updates).
 */
export function gateCertificationRecord(
  record: CertificationRecord | null,
): CertificationRecordGateResult {
  if (!record) {
    return {
      ok: false,
      errors: ['certification_record is missing'],
      version_current: false,
      passes: ['certification_record_gate'],
    }
  }

  const inner = validateCertificationRecord(record)
  const version_current = record.certification_version === CERTIFICATION_VERSION

  const errors = [...inner.errors]
  if (!version_current) {
    errors.push(
      `certification_version stale: got '${record.certification_version}', expected '${CERTIFICATION_VERSION}'`,
    )
  }

  return {
    ok: inner.valid && version_current,
    errors,
    version_current,
    passes: ['certification_record_gate'],
  }
}
