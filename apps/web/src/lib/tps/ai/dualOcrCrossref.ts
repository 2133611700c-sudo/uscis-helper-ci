/**
 * Dual OCR Cross-Reference — Messenginfo Handwritten Cyrillic Pipeline
 *
 * Sends BOTH Vision OCR and DocAI OCR results to DeepSeek for
 * linguistic cross-referencing. DeepSeek acts as arbiter, NOT OCR.
 *
 * Architecture:
 * booklet image → [Vision OCR] → raw text A
 *                → [DocAI OCR]  → raw text B
 *                → [DeepSeek]   → cross-referenced structured fields
 *
 * Rules:
 * - DeepSeek can only use evidence from the two OCR texts
 * - Patronymic inference must be flagged as review_required
 * - Given name: if no OCR evidence → null (manual only)
 * - Garbage is rejected, not shown as truth
 */

import { chat, type ChatMessage } from '@/lib/deepseek/client'

export interface CrossRefField {
  value: string | null
  confidence: 'high' | 'medium' | 'low' | 'garbage' | 'inferred'
  vision_evidence: string | null
  docai_evidence: string | null
  reasoning: string
  review_required: boolean
}

export interface CrossRefResult {
  ok: boolean
  surname: CrossRefField
  given_name: CrossRefField
  patronymic: CrossRefField
  date_of_birth: CrossRefField
  city_of_birth: CrossRefField
  province_of_birth: CrossRefField
  processing_ms: number
  error?: string
}

const CROSSREF_PROMPT = `You are a Ukrainian document OCR expert.
I have TWO separate OCR readings of the SAME Ukrainian internal passport (booklet).
Both read the same handwritten document but with different OCR engines.

=== GOOGLE VISION OCR ===
{VISION_TEXT}

=== GOOGLE DOCUMENT AI OCR ===
{DOCAI_TEXT}

TASK: Cross-reference both OCR readings to extract structured fields.
For each field:
- Compare what each engine read
- Pick the MOST PLAUSIBLE value by combining evidence from both
- If both give garbage for a field, set value to null
- Do NOT invent values without OCR evidence from at least one engine

KNOWN FACTS:
- This is a Ukrainian internal passport
- Surnames end in typical Ukrainian endings (-ник, -ко, -ук, -чук, etc.)
- Patronymics end in -ович/-овна/-івна (Cyrillic); full patronymic must include a name root + suffix
- Cities are real Ukrainian cities (must exist in Ukraine)
- Province = one of 25 Ukrainian oblasts
- Both OCR engines may read the SAME handwritten text differently — cross-reference helps
- IMPORTANT: When two OCR readings differ, construct the BEST HYBRID by combining correctly-read parts from each. Example: if Vision reads "Коваленко" and DocAI reads "Коваронко", the correct hybrid might be "Коваленко" (Ковал- prefix + -енко suffix), because "-енко" is a common Ukrainian surname suffix.
- Similarly for patronymics: if both readings start with "Іван..." consider that "Іванович" is the standard patronymic from "Іван".

HANDWRITING CONFUSION RULES (critical — these are the most common misreads):
1. Ukrainian "Т" and "П" look nearly identical in handwriting (both have horizontal tops). If a city starts with "Пр-" but "Пр-" does not form a known Ukrainian city, try "Тр-" instead.
2. "И" and "Н" may be confused in cursive.
3. "С" and "О" may be confused.

PATRONYMIC COMPLETENESS RULE (critical):
- A complete Ukrainian male patronymic has NAME ROOT + suffix (-ович/-евич/-єович): e.g., Іванович (8 chars), Петрович (8 chars), Миколайович (12 chars).
- If OCR only captured the suffix without the name root (e.g., "ович", "йович", "Yovych", "овна"), this is an INCOMPLETE fragment — set value to null, not the fragment.
- Minimum length for a valid patronymic: 8 characters. Anything shorter is a fragment — return null.

LINGUISTIC ANALYSIS: For each field, explain WHY your reconstruction is better than either raw reading.

Respond ONLY in valid JSON (no markdown, no backticks):
{"surname":{"value":"...","confidence":"high|medium|low|garbage|inferred","vision_evidence":"...","docai_evidence":"...","reasoning":"...","review_required":false},"given_name":{...},"patronymic":{...},"date_of_birth":{...},"city_of_birth":{...},"province_of_birth":{...}}`

export async function runDualOcrCrossref(
  visionText: string,
  docaiText: string,
): Promise<CrossRefResult> {
  const startTime = Date.now()

  const prompt = CROSSREF_PROMPT
    .replace('{VISION_TEXT}', visionText)
    .replace('{DOCAI_TEXT}', docaiText)

  try {
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }]
    const response = await chat(messages, { temperature: 0.1, maxTokens: 1500 })

    // Parse JSON response
    const raw = response.content.replace(/```json|```/g, '').trim()
    let parsed: Record<string, any>
    try {
      parsed = JSON.parse(raw)
    } catch {
      return {
        ok: false, processing_ms: Date.now() - startTime,
        error: 'DeepSeek returned invalid JSON',
        surname: emptyField(), given_name: emptyField(), patronymic: emptyField(),
        date_of_birth: emptyField(), city_of_birth: emptyField(), province_of_birth: emptyField(),
      }
    }

    // Map fields with safety guards
    const fields = ['surname', 'given_name', 'patronymic', 'date_of_birth', 'city_of_birth', 'province_of_birth'] as const
    const result: any = { ok: true, processing_ms: Date.now() - startTime }

    for (const f of fields) {
      const raw_f = parsed[f]
      if (!raw_f || typeof raw_f !== 'object') {
        result[f] = emptyField()
        continue
      }
      const confidence = raw_f.confidence || 'garbage'
      // Patronymic inferred = always review_required
      const isInferred = f === 'patronymic' && confidence === 'inferred'
      result[f] = {
        value: (confidence === 'garbage') ? null : (raw_f.value || null),
        confidence,
        vision_evidence: raw_f.vision_evidence || null,
        docai_evidence: raw_f.docai_evidence || null,
        reasoning: raw_f.reasoning || '',
        review_required: raw_f.review_required === true || isInferred || confidence === 'low',
      }
    }

    return result as CrossRefResult
  } catch (err: any) {
    return {
      ok: false, processing_ms: Date.now() - startTime,
      error: err.message || 'Unknown error',
      surname: emptyField(), given_name: emptyField(), patronymic: emptyField(),
      date_of_birth: emptyField(), city_of_birth: emptyField(), province_of_birth: emptyField(),
    }
  }
}

function emptyField(): CrossRefField {
  return { value: null, confidence: 'garbage', vision_evidence: null, docai_evidence: null, reasoning: '', review_required: true }
}
