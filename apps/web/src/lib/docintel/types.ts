/**
 * docintel/types — canonical types for the Document Intelligence layer.
 *
 * This is the PERMANENT shared spine. One pipeline reads a document → produces
 * verified, provenance-tracked, transliterated fields → consumed by ANY product
 * (TPS, ReParole, EAD, Translation). No product-specific OCR logic lives here.
 *
 * Design rules (do not violate):
 *  - Provider-agnostic: vision/OCR providers implement VisionProvider; the
 *    reader never hardcodes a vendor (v5 "vision provider remains pluggable").
 *  - Cyrillic is read by vision; Latin is produced by deterministic KMU-55 —
 *    NEVER by the LLM (see transliterationPolicy). Enforced centrally.
 *  - Every field carries provenance + confidence + review flag. Candidate-only;
 *    the consuming product's Review Gate makes values final.
 */

/** Script of the source document. */
export type DocScript = 'cyrillic' | 'latin' | 'mixed'

/**
 * How a field's raw (Cyrillic) read becomes a canonical value. Drives
 * transliterationPolicy — the single place that decides name vs place vs date.
 */
export type FieldKind =
  | 'name' // surname/given/patronymic → KMU-55, never LLM
  | 'place_city' // city/settlement → KMU-55
  | 'place_oblast' // oblast → nominative + "Oblast"
  | 'date' // → ISO YYYY-MM-DD
  | 'doc_number' // series/number/act number → preserve exactly
  | 'agency' // issuing authority → glossary
  | 'sex' // Ч/Ж/M/F → Male/Female (SEX_MAP)
  | 'text' // free text (seal, note)

/** Which product flows consume a document type. Lets one base serve all. */
export type ProductConsumer = 'tps' | 'reparole' | 'ead' | 'translation'

export interface DocFieldSpec {
  /** Canonical field id shared across products (e.g. 'family_name'). */
  field: string
  /** Ukrainian label as printed on the document (helps the vision prompt). */
  label_uk: string
  kind: FieldKind
  /** Handwritten fields are vision-critical (OCR-text pipelines fail them). */
  handwritten: boolean
  required: boolean
}

export interface DocTypeSpec {
  /** Stable id, e.g. 'ua_internal_passport_booklet'. */
  id: string
  title_en: string
  script: DocScript
  /** Products that consume this document type. */
  consumers: ProductConsumer[]
  fields: DocFieldSpec[]
  /**
   * Field whose successful read means "the page was genuinely read" — used to
   * decide whether a cheaper fallback (text crossref) can be skipped.
   */
  vision_anchor: string
}

/** Raw read returned by a vision provider — Cyrillic only, no transliteration. */
export interface VisionFieldRead {
  field: string
  cyrillic: string
  iso_date?: string | null
  can_read: boolean
  confidence: number
  reason: string
}

export interface VisionReadResult {
  ok: boolean
  fields: VisionFieldRead[]
  model: string | null
  ms: number
  error?: string
  /**
   * Honest degradation (P1): the LAST HTTP status the provider saw on a failed
   * read (e.g. 429, 503, 403). Lets readDocument classify a provider failure as a
   * typed OCR error so the route can fail CLOSED instead of returning 200+[].
   * Undefined for success or a non-HTTP failure (timeout/network → see `error`).
   */
  errorStatus?: number
  /** True when the failure was a client/network timeout (AbortError). */
  errorTimeout?: boolean
}

/** A provider that reads document fields from an image. Vendor-agnostic. */
export interface VisionProvider {
  readonly name: string
  readFields(
    imageBuffer: Buffer,
    mimeType: string,
    spec: DocTypeSpec,
    opts?: { timeoutMs?: number; attemptsPerModel?: number },
  ): Promise<VisionReadResult>
}

/** Canonical extracted field — what every downstream product consumes. */
export interface ExtractedDocField {
  field: string
  kind: FieldKind
  /** Original Cyrillic the vision provider read (provenance). */
  raw_cyrillic: string | null
  /** Canonical value: KMU-55 Latin for names/places, ISO for dates, exact for numbers. */
  value: string | null
  confidence: number
  review_required: boolean
  source: 'vision'
  provider: string
  /** Optional machine-readable reasons review was forced (e.g. anti-fabrication gate). */
  review_reasons?: string[]
}

export interface DocumentReadResult {
  ok: boolean
  doc_type_id: string
  fields: ExtractedDocField[]
  /** True if the vision_anchor field was read (page genuinely recognized). */
  anchor_read: boolean
  provider: string | null
  model: string | null
  ms: number
  status: string
  error?: string
  /**
   * Honest degradation (P1): typed provider-error classification when the read
   * FAILED at the provider (rate-limit / 5xx / billing / timeout). When present,
   * the route MUST fail closed (honest non-2xx) rather than treat 0 fields as a
   * successful empty extraction. PII-free; no secrets.
   */
  provider_error?: import('@/lib/ocr/ocrErrors').OcrProviderError
  /** Self-consistency gate outcome (only set when the gate ran). PII-free. */
  self_consistency?: {
    status: 'agree' | 'mismatch' | 'incomplete' | 'insufficient_identity_fields'
    instability: boolean
    identity_hash_prefix?: string
    runs?: number
  }
}
