import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Source-level invariants for the Stage 0.5 legacy-operator security hotfix.
 * These guard the exact hard-fail conditions (recipient from body, mutate
 * before auth) against regression — they are cheap and deterministic.
 */
const actionsSrc = readFileSync(resolve(__dirname, '../actions.ts'), 'utf8')
const pageSrc = readFileSync(resolve(__dirname, '../page.tsx'), 'utf8')

const MUTATIONS = ['sendTranslation', 'approveAndSendPdf', 'markInReview']
const SIDE_EFFECTS = ['createAdminSupabaseClient(', 'sendEmail(', 'fetch(', '.update(', 'generateTranslationPDF(']

function fnBody(name: string): string {
  const start = actionsSrc.indexOf(`export async function ${name}(`)
  expect(start, `${name} must exist`).toBeGreaterThan(-1)
  const after = actionsSrc.indexOf('\nexport async function ', start + 1)
  return actionsSrc.slice(start, after === -1 ? actionsSrc.length : after)
}

describe('legacy operator actions — authorize before any side effect', () => {
  for (const name of MUTATIONS) {
    it(`${name} calls requireTranslationOperator before any side effect`, () => {
      const body = fnBody(name)
      const authIdx = body.indexOf('requireTranslationOperator(')
      expect(authIdx, `${name} must call requireTranslationOperator`).toBeGreaterThan(-1)
      for (const fx of SIDE_EFFECTS) {
        const i = body.indexOf(fx)
        if (i !== -1) {
          expect(authIdx, `${name}: auth must precede ${fx}`).toBeLessThan(i)
        }
      }
    })
  }
})

describe('recipient is server-authoritative, never from the request body', () => {
  it('actions.ts never reads recipientEmail from formData', () => {
    expect(actionsSrc.includes("formData.get('recipientEmail')")).toBe(false)
    expect(/formData\.get\(\s*['"]recipientEmail['"]\s*\)/.test(actionsSrc)).toBe(false)
  })

  it('send paths re-verify the recipient against Stripe (resolveVerifiedRecipient + stripe verifier)', () => {
    for (const name of ['sendTranslation', 'approveAndSendPdf']) {
      const body = fnBody(name)
      expect(body.includes('resolveVerifiedRecipient(supabase, id, stripeTranslationVerifier)')).toBe(true)
    }
    // The deployed contact_email column has client writers — it must NOT be the
    // trusted recipient source; recipient comes only from the re-verifier.
    expect(actionsSrc.includes('resolveAuthoritativeRecipient')).toBe(false)
  })

  it('send paths fail closed when there is no verified recipient', () => {
    expect(actionsSrc.includes('recipient_not_verified')).toBe(true)
  })

  it('the operator page no longer submits an authoritative recipientEmail field', () => {
    expect(pageSrc.includes('name="recipientEmail"')).toBe(false)
  })
})
