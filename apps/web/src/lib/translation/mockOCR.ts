/**
 * Mock OCR / AI Extraction Engine for Translation Lab
 *
 * Simulates document field extraction with realistic confidence scores.
 * Each sample document has pre-defined extraction results that include
 * intentional errors and low-confidence fields to demonstrate the review UX.
 *
 * Status tiers:
 *   PASS    — confidence ≥ 85%  (green)
 *   REVIEW  — confidence 65–84% (yellow, user must verify)
 *   FAIL    — confidence < 65%  (red, AI could not extract)
 *
 * In production this would call Google Vision / AWS Textract / Azure OCR.
 * If NEXT_PUBLIC_OCR_PROVIDER is not configured, the real-upload path
 * returns an empty result and prompts manual entry.
 */

import type { SampleId } from './sampleDocuments'

export type OCRStatus = 'pass' | 'review' | 'fail'

export interface OCRField {
  key: string
  labelUk: string
  labelEn: string
  aiValue: string         // what the AI extracted
  expectedValue: string   // ground truth from the sample definition
  editedValue: string     // user's current value (starts as aiValue)
  confidence: number      // 0–100
  status: OCRStatus
  note?: string           // why confidence is low
  group: 'personal' | 'document' | 'authority'
  userEdited: boolean
}

export interface OCRResult {
  sampleId: SampleId
  fields: OCRField[]
  overallConfidence: number
  passCount: number
  reviewCount: number
  failCount: number
  processingMs: number
}

// ---------------------------------------------------------------------------
// Pre-computed extraction results per sample
// (Intentional errors on 1–2 fields per document to demo review UX)
// ---------------------------------------------------------------------------

type RawExtraction = Omit<OCRField, 'editedValue' | 'status' | 'userEdited'>

const EXTRACTIONS: Record<SampleId, RawExtraction[]> = {

  passport_ua: [
    {
      key: 'full_name',
      labelUk: 'Прізвище',
      labelEn: 'Last Name',
      aiValue: 'KOVALENKO',
      expectedValue: 'KOVALENKO',
      confidence: 98,
      group: 'personal',
    },
    {
      key: 'given_names',
      labelUk: "Ім'я та по батькові",
      labelEn: 'Given Names',
      aiValue: 'OLENA VASYLIVNA',
      expectedValue: 'OLENA VASYLIVNA',
      confidence: 96,
      group: 'personal',
    },
    {
      key: 'sex',
      labelUk: 'Стать',
      labelEn: 'Sex',
      aiValue: 'F',
      expectedValue: 'F',
      confidence: 99,
      group: 'personal',
    },
    {
      key: 'date_of_birth',
      labelUk: 'Дата народження',
      labelEn: 'Date of Birth',
      aiValue: '1985-03-15',
      expectedValue: '1985-03-15',
      confidence: 94,
      group: 'personal',
    },
    {
      key: 'place_of_birth',
      labelUk: 'Місце народження',
      labelEn: 'Place of Birth',
      aiValue: 'KYIV, UKRAINE',
      expectedValue: 'KYIV, UKRAINE',
      confidence: 89,
      group: 'personal',
    },
    {
      key: 'nationality',
      labelUk: 'Громадянство',
      labelEn: 'Nationality',
      aiValue: 'UKRAINIAN',
      expectedValue: 'UKRAINIAN',
      confidence: 97,
      group: 'personal',
    },
    {
      key: 'document_number',
      labelUk: 'Номер паспорта',
      labelEn: 'Passport Number',
      aiValue: 'FE123456',
      expectedValue: 'FE123456',
      confidence: 99,
      group: 'document',
    },
    {
      key: 'issue_date',
      labelUk: 'Дата видачі',
      labelEn: 'Date of Issue',
      aiValue: '2018-06-20',
      expectedValue: '2018-06-20',
      confidence: 93,
      group: 'document',
    },
    {
      key: 'expiry_date',
      labelUk: 'Термін дії до',
      labelEn: 'Date of Expiry',
      aiValue: '2028-06-20',
      expectedValue: '2028-06-20',
      confidence: 91,
      group: 'document',
    },
    {
      key: 'issuing_authority',
      labelUk: 'Орган видачі',
      labelEn: 'Issuing Authority',
      // Passport prints only the numeric code; full name needs manual lookup
      aiValue: '1007',
      expectedValue: 'State Migration Service of Ukraine, Kyiv — No. 1007',
      confidence: 71,
      note: 'Passport prints only a numeric code. Please enter the full authority name.',
      group: 'authority',
    },
  ],

  birth_cert_ua: [
    {
      key: 'full_name',
      labelUk: 'Прізвище дитини',
      labelEn: "Child's Last Name",
      aiValue: 'KOVALENKO',
      expectedValue: 'KOVALENKO',
      confidence: 96,
      group: 'personal',
    },
    {
      key: 'given_names',
      labelUk: "Ім'я дитини",
      labelEn: "Child's First Name",
      aiValue: 'MARIIA',
      expectedValue: 'MARIIA',
      confidence: 94,
      group: 'personal',
    },
    {
      key: 'date_of_birth',
      labelUk: 'Дата народження',
      labelEn: 'Date of Birth',
      aiValue: '2010-07-12',
      expectedValue: '2010-07-12',
      confidence: 92,
      group: 'personal',
    },
    {
      key: 'place_of_birth',
      labelUk: 'Місце народження',
      labelEn: 'Place of Birth',
      aiValue: 'KYIV, UKRAINE',
      expectedValue: 'KYIV, UKRAINE',
      confidence: 88,
      group: 'personal',
    },
    {
      key: 'father_name',
      labelUk: "Ім'я батька",
      labelEn: "Father's Full Name",
      aiValue: 'OLEKSII PETROVYCH KOVALENKO',
      expectedValue: 'OLEKSII PETROVYCH KOVALENKO',
      confidence: 91,
      group: 'personal',
    },
    {
      key: 'mother_name',
      labelUk: "Ім'я матері",
      labelEn: "Mother's Full Name",
      // Stamp partially covered the maiden name on the sample
      aiValue: 'OLENA KOVALENKO',
      expectedValue: 'OLENA VASYLIVNA KOVALENKO (née FRANKO)',
      confidence: 77,
      note: 'Patronymic and maiden name may be obscured by registry seal. Verify original.',
      group: 'personal',
    },
    {
      key: 'document_number',
      labelUk: 'Номер свідоцтва',
      labelEn: 'Certificate Number',
      // "I" vs "l" OCR ambiguity in Cyrillic/Latin mixed text
      aiValue: 'l-КВ №987654',
      expectedValue: 'I-КВ №987654',
      confidence: 68,
      note: 'Roman "I" (eye) may be read as lowercase "l" (el). Verify series letter.',
      group: 'document',
    },
    {
      key: 'issue_date',
      labelUk: 'Дата видачі',
      labelEn: 'Date of Issue',
      aiValue: '2010-07-20',
      expectedValue: '2010-07-20',
      confidence: 91,
      group: 'document',
    },
    {
      key: 'issuing_authority',
      labelUk: 'Орган РАЦС',
      labelEn: 'Registry Office',
      aiValue: 'Shevchenkivskyi RATS, Kyiv',
      expectedValue: 'Shevchenkivskyi Civil Registry Office, Kyiv',
      confidence: 83,
      note: 'Abbreviation "РАЦС" expanded — verify full official name.',
      group: 'authority',
    },
  ],

  marriage_cert_ua: [
    {
      key: 'spouse1_name',
      labelUk: 'Прізвище чоловіка',
      labelEn: "Husband's Last Name",
      aiValue: 'KOVALENKO',
      expectedValue: 'KOVALENKO',
      confidence: 98,
      group: 'personal',
    },
    {
      key: 'given_names',
      labelUk: "Ім'я та по батькові чоловіка",
      labelEn: "Husband's Full Name",
      aiValue: 'OLEKSII PETROVYCH',
      expectedValue: 'OLEKSII PETROVYCH',
      confidence: 94,
      group: 'personal',
    },
    {
      key: 'spouse2_name',
      labelUk: 'Прізвище дружини (до шлюбу)',
      labelEn: "Wife's Maiden Last Name",
      // Classic Cyrillic→Latin ambiguity: ФРАНКО → FRANCO vs FRANKO
      aiValue: 'FRANCO',
      expectedValue: 'FRANKO',
      confidence: 72,
      note: 'ФРАНКО transliterates as FRANKO (Ukrainian standard), not FRANCO. Please verify.',
      group: 'personal',
    },
    {
      key: 'mother_name',
      labelUk: "Ім'я та по батькові дружини",
      labelEn: "Wife's Full Name",
      aiValue: 'OLENA VASYLIVNA',
      expectedValue: 'OLENA VASYLIVNA',
      confidence: 91,
      group: 'personal',
    },
    {
      key: 'date_of_marriage',
      labelUk: 'Дата реєстрації шлюбу',
      labelEn: 'Date of Marriage',
      aiValue: '2009-05-15',
      expectedValue: '2009-05-15',
      confidence: 96,
      group: 'document',
    },
    {
      key: 'document_number',
      labelUk: 'Номер свідоцтва',
      labelEn: 'Certificate Number',
      // Cyrillic "КВ" in certificate number
      aiValue: 'KB №112233',
      expectedValue: 'КВ №112233',
      confidence: 74,
      note: 'Cyrillic "КВ" may be read as Latin "KB". Verify using original Cyrillic.',
      group: 'document',
    },
    {
      key: 'issue_date',
      labelUk: 'Дата видачі',
      labelEn: 'Date of Issue',
      aiValue: '2009-05-15',
      expectedValue: '2009-05-15',
      confidence: 93,
      group: 'document',
    },
    {
      key: 'issuing_authority',
      labelUk: 'Орган РАЦС',
      labelEn: 'Registry Office',
      aiValue: 'Pecherskyi RATS, Kyiv',
      expectedValue: 'Pecherskyi Civil Registry Office, Kyiv',
      confidence: 85,
      note: 'Abbreviation expanded from "РАЦС".',
      group: 'authority',
    },
  ],
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function computeStatus(confidence: number): OCRStatus {
  if (confidence >= 85) return 'pass'
  if (confidence >= 65) return 'review'
  return 'fail'
}

/**
 * Simulate async OCR extraction with a realistic delay.
 * Returns OCRResult with all fields populated.
 */
export async function runMockOCR(sampleId: SampleId): Promise<OCRResult> {
  const start = Date.now()

  // Simulate network + processing latency
  await new Promise((r) => setTimeout(r, 1400 + Math.random() * 400))

  const rawFields = EXTRACTIONS[sampleId]
  if (!rawFields) throw new Error(`No extraction data for sample: ${sampleId}`)

  const fields: OCRField[] = rawFields.map((raw) => ({
    ...raw,
    editedValue: raw.aiValue,
    status: computeStatus(raw.confidence),
    userEdited: false,
  }))

  const confidenceSum = fields.reduce((s, f) => s + f.confidence, 0)
  const overallConfidence = Math.round(confidenceSum / fields.length)
  const passCount = fields.filter((f) => f.status === 'pass').length
  const reviewCount = fields.filter((f) => f.status === 'review').length
  const failCount = fields.filter((f) => f.status === 'fail').length

  return {
    sampleId,
    fields,
    overallConfidence,
    passCount,
    reviewCount,
    failCount,
    processingMs: Date.now() - start,
  }
}

/**
 * Build a fieldValues Record<string, string> from OCR result
 * (compatible with TranslationWizard + generateTranslationHTML)
 */
export function ocrResultToFieldValues(result: OCRResult): Record<string, string> {
  return Object.fromEntries(result.fields.map((f) => [f.key, f.editedValue]))
}
