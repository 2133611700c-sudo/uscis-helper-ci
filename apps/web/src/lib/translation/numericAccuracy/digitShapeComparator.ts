/**
 * Digit Shape Comparator — v5 §12 (passport perforated number) + §10.
 *
 * Within a single numeric sequence, ambiguous shapes (3↔8, 5↔6, 0↔O, 1↔I,
 * 6↔9, 4↔A, 7↔Z, 2↔Z) are flagged when OCR confidence on that digit
 * falls below a per-pair threshold. The calling validator MUST set
 * review_required=true if any flag fires.
 *
 * Inputs:
 *   sequence — the raw digit string ("AB123456" or "СО478123")
 *   perDigitConfidence — per-character confidence array (0..1), parallel to sequence
 *
 * Output:
 *   { ok, suspects, flaggedPairs }
 *   - suspects[] lists positions and candidate alternatives
 *   - flaggedPairs[] lists which ambiguity pairs fired anywhere
 */

export interface DigitShapeFlag {
  /** 0-based index in the sequence. */
  position: number
  /** Character at that position (as OCR read it). */
  character: string
  /** Plausible alternatives based on shape similarity. */
  candidates: string[]
  /** Reason — confidence threshold or always-flagged pair. */
  reason: 'low_confidence' | 'always_ambiguous'
  /** OCR confidence at that position (0..1). */
  confidence: number
}

export interface DigitShapeResult {
  ok: boolean
  sequence: string
  suspects: DigitShapeFlag[]
  flaggedPairs: string[]      // e.g. ["3<->8", "5<->6"]
  passes: string[]            // ['digit_shape_compare']
  review_required: boolean
}

/**
 * Ambiguity table.
 *
 *   threshold === null  → ALWAYS flag this pair regardless of confidence
 *                         (0↔O, 1↔I, 6↔9, 4↔A, 2↔Z)
 *   threshold === N     → flag if OCR confidence < N
 */
interface AmbiguityRule {
  pair: [string, string]
  /** null = always flag; number = confidence threshold for flagging. */
  threshold: number | null
}

const AMBIGUITY_RULES: ReadonlyArray<AmbiguityRule> = [
  { pair: ['0', 'O'], threshold: null },
  { pair: ['0', 'Ø'], threshold: null },
  { pair: ['1', 'I'], threshold: null },
  { pair: ['1', 'l'], threshold: null },
  { pair: ['3', '8'], threshold: 0.92 },
  { pair: ['5', '6'], threshold: 0.92 },
  { pair: ['6', '9'], threshold: null },
  { pair: ['7', 'Z'], threshold: 0.95 },
  { pair: ['4', 'A'], threshold: null },
  { pair: ['2', 'Z'], threshold: null },
  { pair: ['B', '8'], threshold: 0.92 },
  { pair: ['G', '6'], threshold: 0.92 },
]

/** Build a fast lookup: char → list of (other, threshold). */
function buildLookup(): Map<string, Array<{ other: string; threshold: number | null; pairLabel: string }>> {
  const map = new Map<string, Array<{ other: string; threshold: number | null; pairLabel: string }>>()
  for (const r of AMBIGUITY_RULES) {
    const [a, b] = r.pair
    const label = `${a}<->${b}`
    if (!map.has(a)) map.set(a, [])
    if (!map.has(b)) map.set(b, [])
    map.get(a)!.push({ other: b, threshold: r.threshold, pairLabel: label })
    map.get(b)!.push({ other: a, threshold: r.threshold, pairLabel: label })
  }
  return map
}

const LOOKUP = buildLookup()

export function compareDigitShapes(
  sequence: string,
  perDigitConfidence: number[],
): DigitShapeResult {
  if (perDigitConfidence.length !== sequence.length) {
    // Defensive: if confidence array doesn't align, treat all positions as
    // confidence=0 so every ambiguity rule fires. Better safe than wrong.
    perDigitConfidence = Array(sequence.length).fill(0)
  }

  const suspects: DigitShapeFlag[] = []
  const firedPairs = new Set<string>()

  for (let i = 0; i < sequence.length; i++) {
    const ch = sequence[i]
    const conf = perDigitConfidence[i] ?? 0
    const rules = LOOKUP.get(ch)
    if (!rules || rules.length === 0) continue

    for (const r of rules) {
      const trigger =
        r.threshold === null
          ? true
          : conf < r.threshold
      if (!trigger) continue

      // Don't double-record same position+candidate.
      const existing = suspects.find(
        s => s.position === i && s.candidates.includes(r.other),
      )
      if (existing) continue

      const existingAtPos = suspects.find(s => s.position === i)
      if (existingAtPos) {
        if (!existingAtPos.candidates.includes(r.other)) {
          existingAtPos.candidates.push(r.other)
        }
      } else {
        suspects.push({
          position: i,
          character: ch,
          candidates: [r.other],
          reason: r.threshold === null ? 'always_ambiguous' : 'low_confidence',
          confidence: conf,
        })
      }
      firedPairs.add(r.pairLabel)
    }
  }

  return {
    ok: suspects.length === 0,
    sequence,
    suspects,
    flaggedPairs: Array.from(firedPairs).sort(),
    passes: ['digit_shape_compare'],
    review_required: suspects.length > 0,
  }
}

/**
 * Specialised helper for the legacy passport booklet: 2 letters + 6 digits.
 * Same comparator but with default per-digit confidence assumed 1.0 unless
 * supplied. Kept thin — passportPerforationValidator already handles the
 * structural shape; this fills the v5 §12 "compare ambiguous digit shapes
 * inside the same sequence" requirement.
 */
export function comparePassportPerforation(
  sequence: string,
  perDigitConfidence?: number[],
): DigitShapeResult {
  const conf = perDigitConfidence ?? Array(sequence.length).fill(1.0)
  return compareDigitShapes(sequence, conf)
}
