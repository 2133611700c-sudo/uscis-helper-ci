import { describe, it, expect } from 'vitest'
import { DOCUMENT_TYPES, getDocTypeSpec, docTypesForConsumer } from '../documentRegistry'
import { toCanonicalValue } from '../transliterationPolicy'
import { readDocument } from '../documentFieldReader'
import type { VisionProvider, VisionFieldRead } from '../types'

describe('docintel/documentRegistry', () => {
  it('declares all 6 UA document types with required structure', () => {
    expect(Object.keys(DOCUMENT_TYPES).length).toBeGreaterThanOrEqual(6)
    for (const spec of Object.values(DOCUMENT_TYPES)) {
      expect(spec.id).toBeTruthy()
      expect(spec.fields.length).toBeGreaterThan(0)
      expect(spec.consumers.length).toBeGreaterThan(0)
      // vision_anchor must be a real field of the doc
      expect(spec.fields.some((f) => f.field === spec.vision_anchor)).toBe(true)
    }
  })

  it('maps consumers → document types (one base serves all products)', () => {
    expect(docTypesForConsumer('tps')).toContain('ua_internal_passport_booklet')
    expect(docTypesForConsumer('translation')).toContain('ua_birth_certificate')
    expect(docTypesForConsumer('reparole')).toContain('ua_marriage_certificate')
    expect(docTypesForConsumer('ead')).toContain('ua_international_passport')
  })

  it('registers ua_military_id (identity page) with civil-identity fields', () => {
    const spec = getDocTypeSpec('ua_military_id')
    expect(spec).not.toBeNull()
    expect(spec!.vision_anchor).toBe('family_name')
    const fieldKeys = spec!.fields.map((f) => f.field)
    expect(fieldKeys).toEqual(['family_name', 'given_name', 'patronymic', 'dob', 'doc_number'])
    // Military civil identity is consumable by translation (and tps/reparole as evidence).
    expect(docTypesForConsumer('translation')).toContain('ua_military_id')
  })

  it('uses `patronymic` (NOT `middle_name`) for «По батькові» source fields (CLAUDE.md hard-rule)', () => {
    for (const spec of Object.values(DOCUMENT_TYPES)) {
      // no source field may be named middle_name — that is a USCIS *form* field, not a source field
      expect(spec.fields.some((f) => f.field === 'middle_name'), `${spec.id} must not use middle_name`).toBe(false)
      // any «По батькові» field is named patronymic / *_patronymic
      const poBatkovi = spec.fields.filter((f) => f.label_uk === 'По батькові')
      for (const f of poBatkovi) expect(f.field === 'patronymic' || f.field.endsWith('patronymic')).toBe(true)
    }
  })
})

describe('docintel — coverage guard (rule auditor: registry ↔ transliteration)', () => {
  // Locks the spine against the fragmentation disease: if someone adds a field
  // whose kind the transliteration policy does not handle, this FAILS in CI.
  const HANDLED_KINDS = new Set(['name', 'place_city', 'place_oblast', 'date', 'doc_number', 'agency', 'sex', 'text'])

  it('every field kind in the registry is handled by transliterationPolicy', () => {
    for (const spec of Object.values(DOCUMENT_TYPES)) {
      for (const f of spec.fields) {
        expect(HANDLED_KINDS.has(f.kind), `${spec.id}.${f.field} kind "${f.kind}" not handled`).toBe(true)
        // toCanonicalValue must not throw for any declared kind
        const v = toCanonicalValue(
          { field: f.field, cyrillic: 'Тест', iso_date: '2000-01-01', can_read: true, confidence: 1, reason: '' },
          f.kind,
        )
        expect(v === null || typeof v === 'string').toBe(true)
      }
    }
  })

  it('every required field is reachable (has a label and canonical field id)', () => {
    for (const spec of Object.values(DOCUMENT_TYPES)) {
      for (const f of spec.fields) {
        expect(f.field.length).toBeGreaterThan(0)
        expect(f.label_uk.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('docintel/transliterationPolicy (KMU-55, never LLM)', () => {
  const read = (cyrillic: string, iso?: string): VisionFieldRead => ({
    field: 'x', cyrillic, iso_date: iso ?? null, can_read: true, confidence: 1, reason: '',
  })

  it('names → exact KMU-55 Latin', () => {
    expect(toCanonicalValue(read("Іваненко"), 'name')).toBe('Ivanenko')
    expect(toCanonicalValue(read('Петрович'), 'name')).toBe('Petrovych')
  })
  it('city → KMU-55 (Vinnytsia, not Prostianets/Troshchianets)', () => {
    expect(toCanonicalValue(read('Вінниця'), 'place_city')).toBe('Vinnytsia')
  })
  it('oblast → nominative + Oblast', () => {
    expect(toCanonicalValue(read('Вінницька область'), 'place_oblast')).toBe('Vinnytsia Oblast')
  })
  it('city strips settlement-type prefix (смт / с.м.т. / м.) → bare city for the form', () => {
    expect(toCanonicalValue(read('смт Вінниця'), 'place_city')).toBe('Vinnytsia')
    expect(toCanonicalValue(read('с.м.т. Вінниця'), 'place_city')).toBe('Vinnytsia') // live Gemini variant
    expect(toCanonicalValue(read('м. Київ'), 'place_city')).toBe('Kyiv')
  })
  it('date → ISO only when well-formed, else null (no guessing)', () => {
    expect(toCanonicalValue(read('01 січня 1990', '1990-01-01'), 'date')).toBe('1990-01-01')
    expect(toCanonicalValue(read('June 25', 'June 25'), 'date')).toBeNull()
  })
})

describe('docintel/documentFieldReader (orchestration with a mock provider)', () => {
  const mockProvider: VisionProvider = {
    name: 'mock',
    async readFields() {
      return {
        ok: true,
        model: 'mock-1',
        ms: 5,
        fields: [
          { field: 'family_name', cyrillic: "Іваненко", can_read: true, confidence: 1, reason: '' },
          { field: 'patronymic', cyrillic: 'Петрович', can_read: true, confidence: 1, reason: '' },
          { field: 'city_of_birth', cyrillic: 'Вінниця', can_read: true, confidence: 0.9, reason: '' },
          { field: 'dob', cyrillic: '', iso_date: '1990-01-01', can_read: true, confidence: 1, reason: '' },
          { field: 'given_name', cyrillic: '', can_read: false, confidence: 0, reason: 'illegible' },
        ],
      }
    },
  }

  it('reads booklet → canonical fields, KMU-55 applied, anchor detected', async () => {
    const r = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_internal_passport_booklet', { provider: mockProvider })
    expect(r.ok).toBe(true)
    expect(r.anchor_read).toBe(true) // family_name read
    const by = Object.fromEntries(r.fields.map((f) => [f.field, f.value]))
    expect(by.family_name).toBe('Ivanenko')
    expect(by.patronymic).toBe('Petrovych') // «По батькові» = patronymic, not middle_name
    expect(by.city_of_birth).toBe('Vinnytsia')
    expect(by.dob).toBe('1990-01-01')
    // REGISTRY BACKFILL: an unread field is NEVER dropped — it appears as an
    // explicit manual-entry row (value:null + review) so the UI can render it.
    const gn = r.fields.find((f) => f.field === 'given_name')!
    expect(gn).toBeDefined()
    expect(gn.value).toBeNull()
    expect(gn.review_required).toBe(true)
    expect(gn.review_reasons).toContain('not_read_manual_entry')
  })

  it('handwritten fields are always review_required', async () => {
    const r = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_internal_passport_booklet', { provider: mockProvider })
    for (const f of r.fields) expect(f.review_required).toBe(true)
  })

  it('unknown doc type → ok:false, never throws', async () => {
    const r = await readDocument(Buffer.from('x'), 'image/jpeg', 'nope', { provider: mockProvider })
    expect(r.ok).toBe(false)
    expect(r.status).toBe('unknown_document_type')
  })

  it('provider failure → ok:false with status', async () => {
    const failing: VisionProvider = { name: 'fail', async readFields() { return { ok: false, fields: [], model: null, ms: 1, error: 'timeout' } } }
    const r = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_birth_certificate', { provider: failing })
    expect(r.ok).toBe(false)
    expect(r.status).toContain('vision_failed')
  })
})
