import { NextResponse } from 'next/server'
import { brainHealth } from '@/lib/central-brain/index'
export const dynamic = 'force-dynamic'
/** Read-only: which products are migrated onto the central brain. No side effects. */
export async function GET() {
  return NextResponse.json(brainHealth())
}
