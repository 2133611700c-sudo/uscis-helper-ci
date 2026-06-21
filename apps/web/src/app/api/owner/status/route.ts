import { NextRequest, NextResponse } from 'next/server'
import { isOwnerSession } from '@/lib/ownerAccess'

export async function GET(request: NextRequest) {
  const session = await isOwnerSession(request)
  return NextResponse.json({
    owner: session.verified,
    // Never expose email in response
  })
}
