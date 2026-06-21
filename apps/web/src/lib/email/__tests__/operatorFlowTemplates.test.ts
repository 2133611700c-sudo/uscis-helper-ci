import { describe, expect, it } from 'vitest'
import { orderCompletedEmail, orderReceivedEmail } from '../operatorFlowTemplates'

const LOCALES = ['en', 'ru', 'uk'] as const
const ORDER_URL = 'https://messenginfo.com/en/order/123e4567-e89b-12d3-a456-426614174000'
const DOC = 'Birth Certificate'

const FORBIDDEN = ['консультация', 'сертифицированный перевод', 'мы подадим за вас', 'Apt 8']

const CYRILLIC = /[Ѐ-ӿ]/

function allStrings(e: { subject: string; html: string; text: string }): string {
  return `${e.subject}\n${e.html}\n${e.text}`
}

describe('orderReceivedEmail', () => {
  for (const locale of LOCALES) {
    it(`${locale}: produces non-empty subject, html, text`, () => {
      const e = orderReceivedEmail({ locale, orderUrl: ORDER_URL, docTypeLabel: DOC })
      expect(e.subject.length).toBeGreaterThan(0)
      expect(e.html.length).toBeGreaterThan(0)
      expect(e.text.length).toBeGreaterThan(0)
    })

    it(`${locale}: html and text contain the order URL`, () => {
      const e = orderReceivedEmail({ locale, orderUrl: ORDER_URL, docTypeLabel: DOC })
      expect(e.html).toContain(ORDER_URL)
      expect(e.text).toContain(ORDER_URL)
    })

    it(`${locale}: no forbidden phrases`, () => {
      const e = orderReceivedEmail({ locale, orderUrl: ORDER_URL, docTypeLabel: DOC })
      const blob = allStrings(e).toLowerCase()
      for (const phrase of FORBIDDEN) {
        expect(blob).not.toContain(phrase.toLowerCase())
      }
    })
  }

  it('es falls back to en', () => {
    const es = orderReceivedEmail({ locale: 'es', orderUrl: ORDER_URL, docTypeLabel: DOC })
    const en = orderReceivedEmail({ locale: 'en', orderUrl: ORDER_URL, docTypeLabel: DOC })
    expect(es).toEqual(en)
  })

  it('en subject is English (no Cyrillic)', () => {
    const e = orderReceivedEmail({ locale: 'en', orderUrl: ORDER_URL, docTypeLabel: DOC })
    expect(CYRILLIC.test(e.subject)).toBe(false)
  })

  it('ru/uk copy is actually Cyrillic', () => {
    for (const locale of ['ru', 'uk'] as const) {
      const e = orderReceivedEmail({ locale, orderUrl: ORDER_URL, docTypeLabel: DOC })
      expect(CYRILLIC.test(e.subject)).toBe(true)
      expect(CYRILLIC.test(e.text)).toBe(true)
      expect(CYRILLIC.test(e.html)).toBe(true)
    }
  })

  it('ru and uk copy differ from each other', () => {
    const ru = orderReceivedEmail({ locale: 'ru', orderUrl: ORDER_URL, docTypeLabel: DOC })
    const uk = orderReceivedEmail({ locale: 'uk', orderUrl: ORDER_URL, docTypeLabel: DOC })
    expect(ru.text).not.toEqual(uk.text)
  })
})

describe('orderCompletedEmail', () => {
  for (const locale of LOCALES) {
    it(`${locale}: produces non-empty subject, html, text mentioning the doc type`, () => {
      const e = orderCompletedEmail({ locale, docTypeLabel: DOC })
      expect(e.subject.length).toBeGreaterThan(0)
      expect(e.html).toContain(DOC)
      expect(e.text).toContain(DOC)
    })

    it(`${locale}: no forbidden phrases`, () => {
      const e = orderCompletedEmail({ locale, docTypeLabel: DOC })
      const blob = allStrings(e).toLowerCase()
      for (const phrase of FORBIDDEN) {
        expect(blob).not.toContain(phrase.toLowerCase())
      }
    })
  }

  it('es falls back to en', () => {
    const es = orderCompletedEmail({ locale: 'es', docTypeLabel: DOC })
    const en = orderCompletedEmail({ locale: 'en', docTypeLabel: DOC })
    expect(es).toEqual(en)
  })

  it('ru/uk copy is actually Cyrillic', () => {
    for (const locale of ['ru', 'uk'] as const) {
      const e = orderCompletedEmail({ locale, docTypeLabel: DOC })
      expect(CYRILLIC.test(e.subject)).toBe(true)
      expect(CYRILLIC.test(e.text)).toBe(true)
    }
  })
})
