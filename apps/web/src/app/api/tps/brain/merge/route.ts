/**
 * POST /api/tps/brain/merge
 *
 * Central Brain merge endpoint. Takes per-slot extracted fields and manual
 * values, applies contract + hallucination guard + priority resolution,
 * and returns a fully merged packet with audit trail.
 *
 * This is an ADDITIVE endpoint — existing /api/tps/ocr/extract and
 * /api/tps/generate-packet are unchanged. Wizard v3+ calls this endpoint
 * after OCR to get a server-side merged view.
 *
 * Authentication: same session-based auth as other TPS API routes.
 * No PII is logged. Field keys only appear in warnings/rejected arrays.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { mergeToCentralBrain } from '@/lib/tps/centralBrain'
import type { SlotId } from '@/lib/tps/ocr/documentContracts'
import type { TpsExtractedField } from '@/lib/tps/types'

// ── Request schema ────────────────────────────────────────────────────────────

const TpsExtractedFieldSchema = z.object({
  field: z.string().max(64),
  raw_value: z.string().max(500),
  normalized_value: z.string().max(500).nullable().optional(),
  extraction_source: z.enum([
    'ocr_mrz', 'ocr_visual', 'ocr_keyword', 'ai_brain',
    'dual_ocr_crossref', 'user_input', 'user_corrected', 'inferred',
  ]),
  source_document_id: z.string().max(128).default(''),
  source_zone: z.string().max(128).default(''),
  confidence: z.number().min(0).max(1).optional(),
})

const MergeRequestSchema = z.object({
  uploads: z.record(z.string(), z.array(TpsExtractedFieldSchema)).optional().default({}),
  manual: z.record(z.string(), z.string()).optional().default({}),
})

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = MergeRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const { uploads: rawUploads, manual } = parsed.data

  // Cast uploads to the expected type (zod output matches runtime shape)
  const uploads: Partial<Record<SlotId, TpsExtractedField[]>> = {}
  for (const [slot, fields] of Object.entries(rawUploads)) {
    uploads[slot as SlotId] = fields as TpsExtractedField[]
  }

  try {
    const result = mergeToCentralBrain({ uploads, manual })
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error'
    return NextResponse.json({ error: 'merge_failed', details: msg }, { status: 500 })
  }
}
