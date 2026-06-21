/**
 * canonical/overrideLoopMode.ts
 *
 * Flag for the canonical override LOOP — the wiring that routes a live
 * user/operator field correction into the canonical override chain
 * (appendCanonicalOverride) IN ADDITION to the legacy user_corrections write.
 *
 * Modes:
 *   off     (DEFAULT) — no canonical override is written. The legacy correction
 *                       path is byte-identical to today. Prod behaviour unchanged.
 *   shadow            — DUAL-WRITE: the legacy correction still happens and stays
 *                       authoritative for output; ADDITIONALLY a confirmed
 *                       canonical override is appended so resolveCanonicalDocument
 *                       reflects the human edit. Canonical is NOT yet the output.
 *   enforce           — resolved canonical is authoritative for output.
 *                       DO NOT ENABLE in this PR — present only so the contract is
 *                       complete; no runtime path consumes it here.
 *
 * Resolution precedence: CANONICAL_OVERRIDE_LOOP env → 'off' default.
 *
 * Fail-safe: any unrecognised value resolves to 'off'. Absence resolves to 'off'.
 * The canonical override write is ALWAYS best-effort and NEVER blocks or alters the
 * legacy correction result (even in shadow). The flag only decides whether the
 * canonical append is attempted at all.
 */

export type OverrideLoopMode = 'off' | 'shadow' | 'enforce'

function normalize(v: string | undefined | null): OverrideLoopMode | undefined {
  const s = (v ?? '').trim().toLowerCase()
  return s === 'off' || s === 'shadow' || s === 'enforce'
    ? (s as OverrideLoopMode)
    : undefined
}

/**
 * Resolve the override-loop mode. Default OFF — no canonical write, no behaviour
 * change. enforce is allowed only via the explicit CANONICAL_OVERRIDE_LOOP env.
 */
export function getOverrideLoopMode(): OverrideLoopMode {
  return normalize(process.env.CANONICAL_OVERRIDE_LOOP) ?? 'off'
}
