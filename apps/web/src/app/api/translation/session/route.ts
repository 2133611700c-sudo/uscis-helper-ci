/**
 * POST /api/translation/session
 * Creates a new translation session (PacketState).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createPacketState, persistPacketState } from '@/lib/translation/packetStateManager'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = getClientIP(req)
  const rl = await rateLimit(`translation_session:${ip}`, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const locale = (body.locale as string) ?? 'en'

  const session_id = randomUUID()
  const state = createPacketState({ session_id, locale })

  await persistPacketState(state)

  return NextResponse.json({
    ok: true,
    session_id,
    status: state.status,
    created_at: state.created_at,
  })
}
