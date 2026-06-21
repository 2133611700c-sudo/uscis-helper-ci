import { NextResponse } from 'next/server'
import { clearOwnerSession } from '@/lib/ownerAccess'

export async function POST() {
  await clearOwnerSession()
  return NextResponse.json({ ok: true, message: 'Owner session cleared.' })
}
