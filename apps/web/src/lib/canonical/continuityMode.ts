export type CanonicalMode = 'off' | 'shadow' | 'enforce'
export type CanonicalProduct = 'tps' | 'reparole' | 'ead' | 'translation'

const ENV_KEY: Record<CanonicalProduct, string> = {
  tps: 'CANONICAL_MODE_TPS',
  reparole: 'CANONICAL_MODE_REPAROLE',
  ead: 'CANONICAL_MODE_EAD',
  translation: 'CANONICAL_MODE_TRANSLATION',
}

function normalize(v: string | undefined | null): CanonicalMode | undefined {
  const s = (v ?? '').trim().toLowerCase()
  return s === 'off' || s === 'shadow' || s === 'enforce' ? (s as CanonicalMode) : undefined
}

/**
 * Resolve the canonical-continuity mode for a SINGLE product.
 * Precedence: product-scoped env (CANONICAL_MODE_<PRODUCT>) → CANONICAL_MODES JSON
 * → legacy global CANONICAL_CONTINUITY_MODE (back-compat) → 'shadow' default.
 *
 * HARD GUARD (applies to ALL products, including tps/reparole/ead/translation):
 * the legacy global CANONICAL_CONTINUITY_MODE can NEVER enable 'enforce'. If the
 * legacy global is 'enforce' it is treated as 'shadow' for every product; it may
 * only ever yield 'off' or 'shadow'. enforce is allowed EXCLUSIVELY via the
 * product-scoped envs (CANONICAL_MODE_<PRODUCT>) or the matching key in the
 * CANONICAL_MODES JSON. This prevents a single broad operator flag from silently
 * turning on hard-failing canonical enforcement across the whole platform.
 */
export function getCanonicalMode(product: CanonicalProduct): CanonicalMode {
  const scoped = normalize(process.env[ENV_KEY[product]])
  if (scoped) return scoped

  const json = process.env.CANONICAL_MODES
  if (json) {
    try {
      const parsed = JSON.parse(json) as Record<string, string>
      const m = normalize(parsed?.[product])
      if (m) return m
    } catch {
      // Malformed CANONICAL_MODES JSON. Emit a PII-SAFE warning (static message +
      // product key only; NEVER the raw value, which could carry operator data)
      // and safely fall through to the legacy/default resolution.
      // eslint-disable-next-line no-console
      console.warn(`[canonical] CANONICAL_MODES is not valid JSON; ignoring (product=${product})`)
    }
  }

  const legacyGlobal = normalize(process.env.CANONICAL_CONTINUITY_MODE)
  if (legacyGlobal) {
    // Legacy global can NEVER enforce for ANY product. Only 'off' passes through;
    // anything else (incl. 'enforce') is clamped to 'shadow'.
    return legacyGlobal === 'off' ? 'off' : 'shadow'
  }

  return 'shadow'
}
