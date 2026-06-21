import { describe, it, expect } from 'vitest'
import { buildEadI765Ops, categorySegments, type EadFieldData } from '../i765FieldMap'

const SAMPLE: EadFieldData = {
  appType: 'new',
  category: 'c11',
  firstName: 'Olena',
  lastName: 'Testenko',
  middleName: '',
  dob: '1985-06-25',
  countryOfBirth: 'Ukraine',
  alienNumber: 'A123456789',
  gender: 'female',
  usAddress: '1213 Gordon St, Los Angeles, CA 90038',
}

function findField(ops: ReturnType<typeof buildEadI765Ops>, field: string) {
  return ops.find((o) => o.field === field)
}

describe('EAD i765FieldMap — categorySegments', () => {
  it('maps each supported category to USCIS letter+number', () => {
    expect(categorySegments('c11')).toEqual({ letter: 'c', number: '11' })
    expect(categorySegments('c08')).toEqual({ letter: 'c', number: '8' })
    expect(categorySegments('a12')).toEqual({ letter: 'a', number: '12' })
  })
  it('"other" and null → null (Item 27 left blank — user fills)', () => {
    expect(categorySegments('other')).toBeNull()
    expect(categorySegments(null)).toBeNull()
  })
})

describe('EAD i765FieldMap — buildEadI765Ops', () => {
  it('Part 1 application-type checkboxes reflect new/renewal exclusively', () => {
    const newOps = buildEadI765Ops({ ...SAMPLE, appType: 'new' })
    expect(findField(newOps, 'form1[0].Page1[0].Part1_Checkbox[0]')?.value).toBe(true)  // initial
    expect(findField(newOps, 'form1[0].Page1[0].Part1_Checkbox[1]')?.value).toBe(false) // replacement (never)
    expect(findField(newOps, 'form1[0].Page1[0].Part1_Checkbox[2]')?.value).toBe(false) // renewal

    const renOps = buildEadI765Ops({ ...SAMPLE, appType: 'renewal' })
    expect(findField(renOps, 'form1[0].Page1[0].Part1_Checkbox[0]')?.value).toBe(false)
    expect(findField(renOps, 'form1[0].Page1[0].Part1_Checkbox[2]')?.value).toBe(true)
  })

  it('writes name parts to Line 1', () => {
    const ops = buildEadI765Ops(SAMPLE)
    expect(findField(ops, 'form1[0].Page1[0].Line1a_FamilyName[0]')?.value).toBe('Testenko')
    expect(findField(ops, 'form1[0].Page1[0].Line1b_GivenName[0]')?.value).toBe('Olena')
    // GAP-3: empty middle name now emits NO op (shared mapper omits absent values;
    // PDF-equivalent — an empty text field and a missing op both leave Line1c blank).
    expect(findField(ops, 'form1[0].Page1[0].Line1c_MiddleName[0]')).toBeUndefined()
    // A present middle name is still written through the shared mapper.
    const withMiddle = buildEadI765Ops({ ...SAMPLE, middleName: 'Ivanivna' })
    expect(findField(withMiddle, 'form1[0].Page1[0].Line1c_MiddleName[0]')?.value).toBe('Ivanivna')
  })

  it('converts DOB ISO → USCIS MM/DD/YYYY', () => {
    const ops = buildEadI765Ops(SAMPLE)
    expect(findField(ops, 'form1[0].Page3[0].Line19_DOB[0]')?.value).toBe('06/25/1985')
  })

  it('Item 27 set correctly per category (c11 → c/11; a12 → a/12; other → blank)', () => {
    for (const [cat, exp] of [
      ['c11', { letter: 'c', number: '11' }],
      ['c08', { letter: 'c', number: '8' }],
      ['a12', { letter: 'a', number: '12' }],
    ] as const) {
      const ops = buildEadI765Ops({ ...SAMPLE, category: cat as EadFieldData['category'] })
      expect(findField(ops, 'form1[0].Page3[0].#area[1].section_1[0]')?.value).toBe(exp.letter)
      expect(findField(ops, 'form1[0].Page3[0].#area[1].section_2[0]')?.value).toBe(exp.number)
    }
    // 'other' → no section_1 op emitted
    const otherOps = buildEadI765Ops({ ...SAMPLE, category: 'other' })
    expect(findField(otherOps, 'form1[0].Page3[0].#area[1].section_1[0]')).toBeUndefined()
  })

  it('gender → exclusive Line 9 checkboxes', () => {
    const f = buildEadI765Ops({ ...SAMPLE, gender: 'female' })
    expect(findField(f, 'form1[0].Page2[0].Line9_Checkbox[0]')?.value).toBe(false)
    expect(findField(f, 'form1[0].Page2[0].Line9_Checkbox[1]')?.value).toBe(true)
    const m = buildEadI765Ops({ ...SAMPLE, gender: 'male' })
    expect(findField(m, 'form1[0].Page2[0].Line9_Checkbox[0]')?.value).toBe(true)
    expect(findField(m, 'form1[0].Page2[0].Line9_Checkbox[1]')?.value).toBe(false)
  })

  it('Line 29 (previously filed I-765) — renewal → Yes; new → No', () => {
    const ren = buildEadI765Ops({ ...SAMPLE, appType: 'renewal' })
    expect(findField(ren, 'form1[0].Page3[0].PtLine29_YesNo[0]')?.value).toBe(true)
    expect(findField(ren, 'form1[0].Page3[0].PtLine29_YesNo[1]')?.value).toBe(false)
    const neu = buildEadI765Ops({ ...SAMPLE, appType: 'new' })
    expect(findField(neu, 'form1[0].Page3[0].PtLine29_YesNo[0]')?.value).toBe(false)
    expect(findField(neu, 'form1[0].Page3[0].PtLine29_YesNo[1]')?.value).toBe(true)
  })

  it('omits A-Number op when alienNumber is empty (first-time applicants)', () => {
    const ops = buildEadI765Ops({ ...SAMPLE, alienNumber: '' })
    expect(findField(ops, 'form1[0].Page2[0].Line7_AlienNumber[0]')).toBeUndefined()
  })
})
