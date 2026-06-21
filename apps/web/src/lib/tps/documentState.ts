/**
 * documentState.ts — TPS per-document localStorage keys + reset.
 *
 * The attestation timestamp (`tps:attest:v1`), the legal-risk flags
 * (`tps:legal-risk:v1`) and the Part-7 background declaration
 * (`wizard:tps-ukraine:part7:v1`) are scoped to ONE document/person. When a NEW
 * document session starts (restart / new upload), they MUST be cleared so a
 * previous person's attestation + legal-risk answers do not silently carry into a
 * different person's packet — the TPS analogue of the Translation
 * session-isolation fix (the live-failure class: stale state across documents).
 */
export const TPS_PERSONAL_KEY = 'wizard:tps-ukraine:personal:v1'
export const TPS_PART7_KEY = 'wizard:tps-ukraine:part7:v1'
export const TPS_ATTEST_KEY = 'tps:attest:v1'
export const TPS_LEGAL_RISK_KEY = 'tps:legal-risk:v1'

/** Per-document keys cleared when a NEW document session starts. */
export const TPS_DOC_SESSION_KEYS = [
  TPS_ATTEST_KEY,
  TPS_LEGAL_RISK_KEY,
  TPS_PART7_KEY,
] as const

interface StorageLike {
  removeItem(key: string): void
}

/**
 * Clear the per-document attestation + legal-risk + Part-7 state so a fresh
 * document does not inherit the previous one. The personal-fields blob is the
 * caller's own reset concern. Never throws.
 */
export function clearTpsDocumentState(storage?: StorageLike): void {
  const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  if (!s) return
  for (const key of TPS_DOC_SESSION_KEYS) {
    try {
      s.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}
