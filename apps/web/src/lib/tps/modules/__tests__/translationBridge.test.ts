import { describe, test, expect } from 'vitest'
import {
  shouldTranslateForTPSPacket,
  resolveTranslationTemplate,
  translationFileName,
  checkTranslationCompleteness,
  type TPSDocumentType,
} from '../../translationBridge'

describe('shouldTranslateForTPSPacket', () => {
  test('passportBooklet → true (Ukrainian, always needs translation)', () => {
    expect(shouldTranslateForTPSPacket('passportBooklet')).toBe(true)
  })
  test('passport → true (Ukrainian passport)', () => {
    expect(shouldTranslateForTPSPacket('passport')).toBe(true)
  })
  test('i94 → false (English, CBP document)', () => {
    expect(shouldTranslateForTPSPacket('i94')).toBe(false)
  })
  test('ead → false (English, USCIS document)', () => {
    expect(shouldTranslateForTPSPacket('ead')).toBe(false)
  })
  test('i797 → false (English, USCIS document)', () => {
    expect(shouldTranslateForTPSPacket('i797')).toBe(false)
  })
  test('dl → false (English, US state document)', () => {
    expect(shouldTranslateForTPSPacket('dl')).toBe(false)
  })
})

describe('resolveTranslationTemplate', () => {
  test('passportBooklet → passportBooklet template', () => {
    expect(resolveTranslationTemplate('passportBooklet')).toBe('passportBooklet')
  })
  test('passport → internationalPassport template', () => {
    expect(resolveTranslationTemplate('passport')).toBe('internationalPassport')
  })
  test('i94 → null (no translation needed)', () => {
    expect(resolveTranslationTemplate('i94')).toBeNull()
  })
  test('dl → null', () => {
    expect(resolveTranslationTemplate('dl')).toBeNull()
  })
})

describe('translationFileName', () => {
  test('passportBooklet → correct filename', () => {
    expect(translationFileName('passportBooklet')).toBe('Translation_Internal_Passport.pdf')
  })
  test('passport → correct filename', () => {
    expect(translationFileName('passport')).toBe('Translation_International_Passport.pdf')
  })
})

describe('checkTranslationCompleteness', () => {
  test('all translations present → empty array', () => {
    const uploaded: TPSDocumentType[] = ['passportBooklet', 'i94', 'dl']
    const translated: TPSDocumentType[] = ['passportBooklet']
    expect(checkTranslationCompleteness(uploaded, translated)).toEqual([])
  })
  test('missing passportBooklet translation → error', () => {
    const uploaded: TPSDocumentType[] = ['passportBooklet', 'i94']
    const translated: TPSDocumentType[] = []
    const result = checkTranslationCompleteness(uploaded, translated)
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('passportBooklet')
  })
  test('no foreign-language docs → no translations needed', () => {
    const uploaded: TPSDocumentType[] = ['i94', 'dl', 'ead']
    expect(checkTranslationCompleteness(uploaded, [])).toEqual([])
  })
  test('both passport types uploaded, only one translated → 1 missing', () => {
    const uploaded: TPSDocumentType[] = ['passport', 'passportBooklet', 'i94']
    const translated: TPSDocumentType[] = ['passport']
    const result = checkTranslationCompleteness(uploaded, translated)
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('passportBooklet')
  })
})
