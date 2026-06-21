import { NextResponse } from 'next/server'

/**
 * Public liveness endpoint. No secrets, no token, no internal data.
 * Returns minimal JSON for deploy verification and monitoring.
 *
 * Private deep health with DB checks stays at /api/health (token-protected).
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'messenginfo',
    timestamp: new Date().toISOString(),
    sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown').slice(0, 7),
    environment: process.env.VERCEL_ENV ?? 'development',
  })
}
