/**
 * POST /api/translation/classify
 *
 * Thin server-side wrapper around classifyToModule(). Accepts a declared
 * documentType + optional confidence and returns the resolved module's
 * status, allowAutoPdf flag, and a boolean `selfServeEligible` the wizard
 * can use to gate payment.
 *
 * Production truth (2026-05-09): only ua_internal_passport_booklet is
 * `selfServeEligible: true`. Any other documentType (or low confidence)
 * resolves to manualReviewModule with selfServeEligible=false.
 *
 * No PII, no OCR, no Stripe. Pure routing.
 *
 * Coverage: the underlying classifyToModule() routing decisions are tested
 * in apps/web/src/components/services/translation/__tests__/wizardScopeAndDeadCode.test.ts
 * (Section 5: "classifyToModule self-serve eligibility") rather than via a
 * separate route handler test, to avoid NextResponse runtime handles leaking
 * past vitest teardown.
 */

import { NextRequest, NextResponse } from 'next/server'
import { classifyToModule } from '@/lib/translation/modules/registry'

interface ClassifyRequest {
  documentType?: string
  confidence?: number
}

interface ClassifyResponse {
  documentType: string
  status: 'active' | 'draft' | 'manual_only' | 'disabled'
  allowAutoPdf: boolean
  selfServeEligible: boolean
}

const ERROR_RESPONSE = (msg: string, status = 400) =>
  NextResponse.json({ error: msg }, { status })

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ClassifyRequest
  try {
    body = (await req.json()) as ClassifyRequest
  } catch {
    return ERROR_RESPONSE('invalid_json')
  }

  const documentType = typeof body.documentType === 'string' ? body.documentType.trim() : ''
  if (!documentType) {
    return ERROR_RESPONSE('documentType_required')
  }

  const confidence = typeof body.confidence === 'number' ? body.confidence : 1.0
  if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    return ERROR_RESPONSE('confidence_out_of_range')
  }

  const mod = classifyToModule(documentType, confidence)
  const allowAutoPdf = mod.reviewPolicy.allowAutoPdf === true
  const selfServeEligible = mod.status === 'active' && allowAutoPdf

  const response: ClassifyResponse = {
    documentType: mod.documentType,
    status: mod.status,
    allowAutoPdf,
    selfServeEligible,
  }
  return NextResponse.json(response, { status: 200 })
}

// Force dynamic — small payloads, no static optimization needed.
export const dynamic = 'force-dynamic'
