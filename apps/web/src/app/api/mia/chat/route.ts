import { NextRequest, NextResponse } from 'next/server'
import { generateMiaAnswer } from '@uscis-helper/ai'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { scrubPII } from '@/lib/security/pii'
import { checkPromptInjection } from '@/lib/security/prompt-guard'

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 20 requests per minute per IP
    const ip = getClientIP(req)
    const rl = await rateLimit(`mia:${ip}`, 20, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before sending another message.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    const body = await req.json()
    const { locale = 'en', serviceSlug = 're-parole-u4u', message, context } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'message required' }, { status: 400 })
    }

    if (message.length > 500) {
      return NextResponse.json({ error: 'message too long (max 500 chars)' }, { status: 400 })
    }

    // Prompt injection guard — block attempts to override system instructions
    const guardResult = checkPromptInjection(message)
    if (!guardResult.safe) {
      console.warn('[security/prompt-guard] injection attempt blocked:', guardResult.label, ip)
      return NextResponse.json(
        { error: 'Your message could not be processed. Please ask a question about your re-parole application.' },
        { status: 400 }
      )
    }

    // Scrub PII before passing to AI (A-Numbers, receipts, SSN, phone, email)
    const safeMessage = scrubPII(message.trim())

    const result = await generateMiaAnswer({
      locale,
      serviceSlug,
      userMessage: safeMessage,
      context,
    })

    return NextResponse.json(result)
  } catch (e: unknown) {
    const msg = String(e)
    if (msg.includes('DEEPSEEK_API_KEY not configured')) {
      return NextResponse.json(
        { error: 'AI assistant temporarily unavailable', code: 'AI_NOT_CONFIGURED' },
        { status: 503 }
      )
    }
    console.error('[mia/chat] error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
