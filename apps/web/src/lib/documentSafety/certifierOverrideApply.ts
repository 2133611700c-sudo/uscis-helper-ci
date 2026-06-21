/**
 * certifierOverrideApply — operator-flow stub.
 *
 * The certifier-authority / AI-certification path was superseded by the
 * operator-review flow (operator edits fields in admin UI before sending PDF).
 * CERTIFIER_OVERRIDE_ENABLED is OFF and will remain OFF until a future explicit
 * re-activation decision. This module keeps its public interface intact so the
 * generate-pdf route compiles unchanged; all paths return fields untouched.
 */

export type AuthorityInput =
  | 'owner_review'
  | 'cross_doc_anchor'
  | 'mfa_confirmed'
  | 'dual_witness'
  | 'other_with_text'

export interface CertifierOverridePayload {
  reason_code: AuthorityInput
  certifier_id: string
  proposed_value?: string | null
  anchor_value?: string | null
  cross_doc_anchor_id?: string | null
  note?: string | null
}

export interface FieldWithMaybeOverride {
  field: string
  normalized_value?: string | null
  final_value?: string | null
  review_required?: boolean
  certifier_override?: CertifierOverridePayload
  [k: string]: unknown
}

export interface ApplyCtx {
  enabled: boolean
  docType: string
  documentClass: string
  sessionId: string
  linkedPdfDocId?: string | null
  timestampUtc: string
  postLaunchEnabled?: boolean
}

export interface OverrideBlock {
  field: string
  reason: string
}

/** No-op: operator-flow supersedes AI certifier override path. */
export async function applyCertifierOverrides(
  fields: FieldWithMaybeOverride[],
  _ctx: ApplyCtx,
): Promise<{ fields: FieldWithMaybeOverride[]; block: OverrideBlock | null }> {
  return { fields, block: null }
}
