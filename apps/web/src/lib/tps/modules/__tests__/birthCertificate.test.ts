/**
 * Unit tests for Birth Certificate extraction module.
 *
 * Hard rules tested:
 *   - review_required=true ALWAYS
 *   - Parent name must NEVER become child_family_name
 *   - role_grounding_verified=false when structure unclear
 *   - wrong_person_risk=true when child/parent blocks ambiguous
 *   - No immigration fields in output
 *   - child_* fields only populated from child block
 */

import { describe, it, expect } from 'vitest'
import { extractBirthCertificate, runBirthCertificateModule } from '../birthCertificate'

// Typical Ukrainian birth certificate OCR text with clear structure
const TYPICAL_BIRTH_CERT_OCR = `СВІДОЦТВО ПРО НАРОДЖЕННЯ
Прізвище: Іваненко
Ім'я: Іван
По батькові: Петрович
Дата народження: 01 січня 1990 р.
Місце народження: Вінниця
Батько: Іваненко Микола Іванович
Мати: Іваненко Ніна Петрівна
Актовий запис № 42
Орган реєстрації: Вінницький РАЦС
Дата видачі: 01 вересня 1986 р.`

// OCR text with ambiguous structure — no clear "Батько"/"Мати" separator
const AMBIGUOUS_OCR = `СВІДОЦТВО ПРО НАРОДЖЕННЯ
Іваненко
1986
Вінниця
Вінницька
Петренко Іван Миколайович`  // could be child or parent — ambiguous

// OCR with parent name that should NOT bleed into child block
const PARENT_CONTAMINATION_RISK_OCR = `СВІДОЦТВО ПРО НАРОДЖЕННЯ
Прізвище: Іваненко
Ім'я: Іван
Дата народження: 01 січня 1990 р.
Батько: Петренко Микола
Мати: Іваненко Ніна
Актовий запис № 42`

describe('extractBirthCertificate — review_required', () => {
  it('review_required is always true', () => {
    const result = extractBirthCertificate(TYPICAL_BIRTH_CERT_OCR)
    expect(result.review_required).toBe(true)
  })

  it('review_required is true even for perfect OCR with clear structure', () => {
    // Hard-case class: review cannot be waived
    const result = extractBirthCertificate(TYPICAL_BIRTH_CERT_OCR)
    expect(result.review_required).toBe(true)
  })

  it('all module fields have review_required=true', () => {
    const result = runBirthCertificateModule(
      { raw_text: TYPICAL_BIRTH_CERT_OCR, lines: TYPICAL_BIRTH_CERT_OCR.split('\n').filter(Boolean).map(t => ({ text: t })) },
      { document_id: 'test' }
    )
    for (const field of result.fields) {
      expect(field.review_required).toBe(true)
    }
  })

  it('module manual_review_required is always true', () => {
    const result = runBirthCertificateModule(
      { raw_text: TYPICAL_BIRTH_CERT_OCR, lines: TYPICAL_BIRTH_CERT_OCR.split('\n').filter(Boolean).map(t => ({ text: t })) },
      { document_id: 'test' }
    )
    expect(result.manual_review_required).toBe(true)
  })
})

describe('extractBirthCertificate — role grounding', () => {
  it('role_grounding_verified=true when Батько/Мати headers present', () => {
    const result = extractBirthCertificate(TYPICAL_BIRTH_CERT_OCR)
    expect(result.role_grounding_verified).toBe(true)
  })

  it('role_grounding_verified=false when structure unclear', () => {
    const result = extractBirthCertificate(AMBIGUOUS_OCR)
    expect(result.role_grounding_verified).toBe(false)
  })

  it('wrong_person_risk=true when child/parent blocks ambiguous', () => {
    const result = extractBirthCertificate(AMBIGUOUS_OCR)
    expect(result.wrong_person_risk).toBe(true)
  })

  it('wrong_person_risk=false when structure is clear', () => {
    const result = extractBirthCertificate(TYPICAL_BIRTH_CERT_OCR)
    expect(result.wrong_person_risk).toBe(false)
  })
})

describe('extractBirthCertificate — parent name must not become child_family_name', () => {
  it('parent name (Петренко) does not become child_family_name', () => {
    const result = extractBirthCertificate(PARENT_CONTAMINATION_RISK_OCR)
    // Child family name should be "Іваненко", not "Петренко"
    if (result.child_family_name !== null) {
      expect(result.child_family_name).not.toBe('Петренко Микола')
      expect(result.child_family_name).not.toContain('Петренко')
    }
  })

  it('father_name is populated from parent block separately', () => {
    const result = extractBirthCertificate(PARENT_CONTAMINATION_RISK_OCR)
    // Father name should be in father_name, not child_family_name
    expect(result.father_name).not.toBeNull()
  })

  it('child_family_name and father_name are different values', () => {
    const result = extractBirthCertificate(PARENT_CONTAMINATION_RISK_OCR)
    if (result.child_family_name !== null && result.father_name !== null) {
      expect(result.child_family_name).not.toBe(result.father_name)
    }
  })

  it('generic family_name field is NOT emitted (must use child_family_name)', () => {
    const result = runBirthCertificateModule(
      { raw_text: TYPICAL_BIRTH_CERT_OCR, lines: TYPICAL_BIRTH_CERT_OCR.split('\n').filter(Boolean).map(t => ({ text: t })) },
      { document_id: 'test' }
    )
    const fieldNames = result.fields.map(f => f.field)
    // These unroled fields must NOT appear — only child_family_name / child_given_name
    expect(fieldNames).not.toContain('family_name')
    expect(fieldNames).not.toContain('given_name')
  })
})

describe('extractBirthCertificate — immigration fields forbidden', () => {
  it('does not populate I-94, A-number, or EAD fields', () => {
    const result = runBirthCertificateModule(
      { raw_text: TYPICAL_BIRTH_CERT_OCR, lines: TYPICAL_BIRTH_CERT_OCR.split('\n').filter(Boolean).map(t => ({ text: t })) },
      { document_id: 'test' }
    )
    const fieldNames = result.fields.map(f => f.field)
    expect(fieldNames).not.toContain('a_number')
    expect(fieldNames).not.toContain('i94_admission_number')
    expect(fieldNames).not.toContain('ead_category_on_card')
    expect(fieldNames).not.toContain('passport_number')
    expect(fieldNames).not.toContain('us_address_street')
  })
})

describe('extractBirthCertificate — field extraction', () => {
  it('extracts child_family_name from Прізвище label', () => {
    const result = extractBirthCertificate(TYPICAL_BIRTH_CERT_OCR)
    expect(result.child_family_name).toBe("Іваненко")
  })

  it('extracts child_given_name from Ім\'я label', () => {
    const result = extractBirthCertificate(TYPICAL_BIRTH_CERT_OCR)
    expect(result.child_given_name).toBe('Іван')
  })

  it('extracts child_date_of_birth with Ukrainian month parsing', () => {
    const result = extractBirthCertificate(TYPICAL_BIRTH_CERT_OCR)
    expect(result.child_date_of_birth).toBe('1990-01-01')
  })

  it('extracts father_name from Батько block', () => {
    const result = extractBirthCertificate(TYPICAL_BIRTH_CERT_OCR)
    expect(result.father_name).not.toBeNull()
  })

  it('extracts mother_name from Мати block', () => {
    const result = extractBirthCertificate(TYPICAL_BIRTH_CERT_OCR)
    expect(result.mother_name).not.toBeNull()
  })

  it('extracts act_record_number', () => {
    const result = extractBirthCertificate(TYPICAL_BIRTH_CERT_OCR)
    expect(result.act_record_number).toBe('42')
  })
})

describe('runBirthCertificateModule — match detection', () => {
  it('matches typical birth certificate OCR', () => {
    const result = runBirthCertificateModule(
      { raw_text: TYPICAL_BIRTH_CERT_OCR, lines: TYPICAL_BIRTH_CERT_OCR.split('\n').filter(Boolean).map(t => ({ text: t })) },
      { document_id: 'test' }
    )
    expect(result.matched).toBe(true)
  })

  it('does not match unrelated document (passport text)', () => {
    const passportText = 'PASSPORT\nFAMILY NAME: KOVALENKO\nGIVEN NAME: IVAN'
    const result = runBirthCertificateModule(
      { raw_text: passportText, lines: passportText.split('\n').filter(Boolean).map(t => ({ text: t })) },
      { document_id: 'test' }
    )
    expect(result.matched).toBe(false)
  })
})

// ── PHASE 2 regression tests: label/value extractor integration ───────────────
// These tests guard the specific bug where label text was returned as field values.
// "child_family_name: прізвищ" → must be null (прізвищ IS a label)
// "child_given_name: ім'я, отчество, по батькові" → must be null (all labels)

describe('extractBirthCertificate — label-as-value regression (Phase 2)', () => {
  it('label text not returned as child_family_name when only bare labels present', () => {
    // прізвищ is a label — must NOT appear as child_family_name
    const r = runBirthCertificateModule(
      { raw_text: 'СВІДОЦТВО\nПрізвище\nімя\n', lines: [] },
      { document_id: 't' }
    )
    const fn = r.fields.find(f => f.field === 'child_family_name')
    // Value must be null or field absent — NOT 'прізвищ' or 'ім\'я'
    expect(fn?.raw_value ?? null).toBeNull()
  })

  it('actual surname extracted when present on next line after label', () => {
    const r = runBirthCertificateModule(
      {
        raw_text: "СВІДОЦТВО ПРО НАРОДЖЕННЯ\nПрізвище\nІваненко\nім'я\nІван\nБатько: Test\nМати: Test2",
        lines: [],
      },
      { document_id: 't' }
    )
    const fn = r.fields.find(f => f.field === 'child_family_name')
    expect(fn?.raw_value).toBe("Іваненко")
  })

  it('given_name not returned as label when bilingual label line used', () => {
    // OCR form: "ім'я, отчество, по батькові" is a trilingual label header
    const r = runBirthCertificateModule(
      {
        raw_text: "СВІДОЦТВО ПРО НАРОДЖЕННЯ\nПрізвище / Прізвищ\nім'я, отчество, по батькові\nБатько: X\nМати: Y",
        lines: [],
      },
      { document_id: 't' }
    )
    const gn = r.fields.find(f => f.field === 'child_given_name')
    // Must be null — label strings must not become values
    expect(gn?.raw_value ?? null).toBeNull()
    const fn = r.fields.find(f => f.field === 'child_family_name')
    expect(fn?.raw_value ?? null).toBeNull()
  })

  it('does not return "прізвищ" as child_family_name', () => {
    // OCR prints "прізвищ" (truncated label) on the next line after "Прізвище"
    const r = extractBirthCertificate('СВІДОЦТВО ПРО НАРОДЖЕННЯ\nПрізвище\nпрізвищ\nБатько: Test\nМати: Test2')
    expect(r.child_family_name).toBeNull()
  })

  it('does not return label-only content as given_name', () => {
    const r = extractBirthCertificate("СВІДОЦТВО\nПрізвище\nім'я\nпо батькові\nБатько: X\nМати: Y")
    // Entire child block is just labels — all must be null
    expect(r.child_family_name).toBeNull()
    expect(r.child_given_name).toBeNull()
  })

  // ── Phase 2 exact tests from task spec ─────────────────────────────────────
  it('raw OCR with only labels returns null child_family_name', () => {
    const rawText = "СВІДОЦТВО ПРО НАРОДЖЕННЯ\nПрізвище\nімя\nпо батькові\n"
    const result = runBirthCertificateModule({ raw_text: rawText, lines: [] }, { document_id: 'test' })
    const fn = result.fields.find(f => f.field === 'child_family_name')
    // Must be null or not present — NOT 'прізвище' or 'імя'
    if (fn) {
      expect(fn.raw_value).not.toBe('прізвище')
      expect(fn.raw_value).not.toBe('прізвищ')
      expect(fn.raw_value).not.toBe("ім'я")
      expect(fn.raw_value).not.toMatch(/^им[яо]/i)
    } else {
      // Preferred: field is absent entirely when value is only labels
      expect(fn).toBeUndefined()
    }
  })

  it('actual value extracted when present after label (Іваненко)', () => {
    const rawText = "СВІДОЦТВО ПРО НАРОДЖЕННЯ\nПрізвище\nІваненко\nім'я\nІван\nБатько: Test\nМати: Test2"
    const result = runBirthCertificateModule({ raw_text: rawText, lines: [] }, { document_id: 'test' })
    const fn = result.fields.find(f => f.field === 'child_family_name')
    expect(fn?.raw_value).toBe("Іваненко")
  })
})
