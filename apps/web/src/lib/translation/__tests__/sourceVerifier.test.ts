/**
 * sourceVerifier.test.ts — pure-logic tests for the source verifier (Prompt 3).
 * Network fetching is exercised by running the script; here we lock the matcher:
 * a verified source matches act number + keywords; a wrong/stale page fails.
 */
import { describe, it, expect } from 'vitest'
import { extractTitle, matchesExpected } from '../../../../../../scripts/verify-ukraine-sources.mjs'

describe('source verifier — content matching', () => {
  it('extracts the <title>', () => {
    expect(extractTitle('<html><head><title> Постанова 1025-2010 </title></head>')).toBe('Постанова 1025-2010')
    expect(extractTitle('<html>no title</html>')).toBe('')
  })

  it('verifies when the page contains the act number and all keywords', () => {
    const html = '<title>Про затвердження ... №1025 від 10.11.2010</title> body 2010'
    const r = matchesExpected(html, { expectNumber: '1025', keywords: ['1025', '2010'] })
    expect(r.ok).toBe(true)
  })

  it('FAILS on a stale/wrong page (CDN served a different act)', () => {
    const html = '<title>Постанова №152 від 2014</title>' // expected 1025
    const r = matchesExpected(html, { expectNumber: '1025', keywords: ['1025', '2010'] })
    expect(r.ok).toBe(false)
    expect(r.numberOk).toBe(false)
  })

  it('FAILS when a required keyword is absent', () => {
    const html = '<title>№1025</title> no year here'
    const r = matchesExpected(html, { expectNumber: '1025', keywords: ['1025', '2010'] })
    expect(r.ok).toBe(false)
    expect(r.keywordsOk).toBe(false)
  })
})
