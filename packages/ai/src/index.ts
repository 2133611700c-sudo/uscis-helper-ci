/**
 * Messenginfo AI client — DeepSeek via OpenAI-compatible API
 * Model routing:
 *   deepseek-reasoner (R1) → Mia consultation / legal-adjacent reasoning
 *   deepseek-chat         → Mia FAQ simple responses (default)
 */
import OpenAI from 'openai'

export interface MiaInput {
  locale: string
  serviceSlug: string
  userMessage: string
  context?: string
}

export interface MiaOutput {
  answer: string
  model: string
  disclaimer: string
}

const DISCLAIMER: Record<string, string> = {
  en: 'This is general information only, not legal advice. Consult a qualified immigration attorney for your specific situation.',
  ru: 'Это только общая информация, а не юридическая консультация. По вашей конкретной ситуации обратитесь к квалифицированному иммиграционному адвокату.',
  uk: 'Це лише загальна інформація, а не юридична порада. З вашою конкретною ситуацією зверніться до кваліфікованого імміграційного адвоката.',
  es: 'Esta es solo información general, no asesoría legal. Consulte a un abogado de inmigración calificado para su situación específica.',
}

const HIGH_RISK_TERMS = ['guarantee', 'approve', 'qualify', 'certif', 'guaranteed', 'will be approved']

function containsHighRisk(text: string): boolean {
  return HIGH_RISK_TERMS.some(t => text.toLowerCase().includes(t))
}

// Verified USCIS facts injected into system prompt to override stale training data.
// Source: USCIS Forms Updates page + I-131 PDF (verified 2026-05-03).
// Update this block when USCIS publishes new editions or policy changes.
const VERIFIED_FACTS: Record<string, string> = {
  're-parole-u4u': [
    'VERIFIED USCIS FACTS for Re-Parole U4U (as of 2026-05-03, source: uscis.gov/forms/forms-updates + i-131.pdf):',
    '- Form: I-131 (Application for Travel Document)',
    '- Current accepted edition: 02/27/26. Edition 01/20/25 is NO LONGER accepted by USCIS as of April 1, 2026.',
    '- Item for Ukrainian re-parole (U4U): Part 2, Item 10.C "Re-Parole" (verified from I-131 PDF text)',
    '- Write "Ukraine RE-PAROLE" at the top of the form',
    '- Filing window: within 180 days before current parole expires',
    '- USCIS fees: do NOT state specific dollar amounts — direct users to uscis.gov/feecalculator',
    '- Re-parole program for in-US Ukrainians resumed June 9, 2025',
    '- EAD category: (c)(11) per I-765 instructions',
    'When answering questions about I-131 edition, ALWAYS use 02/27/26 — NOT any older date.',
  ].join('\n'),
}

function getSystemPrompt(locale: string, serviceSlug: string): string {
  const verifiedFacts = VERIFIED_FACTS[serviceSlug] ?? ''
  const factsBlock = verifiedFacts
    ? `\n\nVERIFIED FACTS (use these — override your training data if it differs):\n${verifiedFacts}\n`
    : ''

  return `You are Mia, an information assistant for Messenginfo, a self-help tool for immigrants navigating USCIS forms.

RULES (NEVER VIOLATE):
1. You provide general information only — never legal advice.
2. Never say "you qualify", "you will be approved", "guaranteed", or make any outcome predictions.
3. Never claim to be affiliated with USCIS, DHS, or any government agency.
4. If asked for legal advice, say: "Please consult a qualified immigration attorney."
5. If you are unsure, say: "I cannot verify this. Please check uscis.gov directly."
6. You are helping with: ${serviceSlug}
7. Respond in: ${locale}
8. Keep answers concise (under 120 words).
9. Always end with "Check official info at uscis.gov."
10. Never hallucinate form numbers, fees, or deadlines.
11. FEES: Never state specific USCIS dollar amounts. Always say "check uscis.gov/feecalculator".${factsBlock}`
}

export async function generateMiaAnswer(input: MiaInput): Promise<MiaOutput> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured')
  }

  if (containsHighRisk(input.userMessage)) {
    return {
      answer:
        'This question requires legal analysis I cannot provide. Please consult a qualified immigration attorney. Check official info at uscis.gov.',
      model,
      disclaimer: DISCLAIMER[input.locale] ?? DISCLAIMER.en,
    }
  }

  const client = new OpenAI({ apiKey, baseURL })

  const response = await client.chat.completions.create({
    model,
    max_tokens: 200,
    temperature: 0.3,
    messages: [
      { role: 'system', content: getSystemPrompt(input.locale, input.serviceSlug) },
      { role: 'user', content: input.userMessage },
    ],
  })

  const answer =
    response.choices[0]?.message?.content ??
    'I could not generate an answer. Please check uscis.gov directly.'

  return {
    answer,
    model,
    disclaimer: DISCLAIMER[input.locale] ?? DISCLAIMER.en,
  }
}
