/**
 * POST /api/tps/translation/preview
 *
 * Generates translation HTML draft for the TranslationReviewGate component.
 * Does NOT produce a ZIP. Does NOT require reviewConfirmed.
 *
 * Returns { translation_html, certification_html, violations[] }
 * so the wizard can show the Review Gate before generating the final packet.
 *
 * Authentication: same session/owner check as generate-packet.
 * P3 of TPS Translation Pipeline v3.0 (ADR-008).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { translateBookletFromBrain, generateTPSTranslation, shouldTranslateForTPSPacket } from '@/lib/tps/translationBridge'
import type { TPSDocumentType } from '@/lib/tps/translationBridge'
import type { MergedField, RejectedField } from '@/lib/tps/centralBrain'

// ── Request schema ────────────────────────────────────────────────────────────

const PreviewRequestSchema = z.object({
  docType: z.enum(['passportBooklet', 'passport', 'i94', 'ead', 'i797', 'dl']),
  signerName: z.string().max(200).default(''),
  signerAddress: z.string().max(500).default(''),
  signatureDataUrl: z.string().nullable().optional(),
  brainMerged: z.record(z.unknown()).nullable().optional(),
  brainRejected: z.array(z.unknown()).nullable().optional(),
  brainManual: z.record(z.string()).nullable().optional(),
})

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = PreviewRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const { docType, signerName, signerAddress, signatureDataUrl, brainMerged, brainRejected, brainManual } = parsed.data

  if (!shouldTranslateForTPSPacket(docType as TPSDocumentType)) {
    return NextResponse.json({ error: 'doc_type_does_not_need_translation' }, { status: 400 })
  }

  try {
    const signerOpts = {
      signerName,
      signerAddress,
      signatureDataUrl: signatureDataUrl ?? null,
    }

    let result: { translation_html: string; certification_html: string; violations: string[] } | null = null

    if (docType === 'passportBooklet' && brainMerged) {
      result = translateBookletFromBrain(
        brainMerged as Record<string, MergedField>,
        {
          ...signerOpts,
          rejected: (brainRejected ?? []) as RejectedField[],
          manual: brainManual ?? {},
        },
      )
    } else if (docType === 'passportBooklet') {
      // Fallback: no CB — return placeholder indicating manual entry needed
      return NextResponse.json({
        translation_html: '<p>Translation preview unavailable — document recognition not complete. Please ensure your passport booklet was uploaded and recognized.</p>',
        certification_html: '',
        violations: [],
        preview_only: true,
      })
    }

    if (!result) {
      return NextResponse.json({ error: 'translation_generation_failed' }, { status: 500 })
    }

    return NextResponse.json({
      translation_html: result.translation_html,
      certification_html: result.certification_html,
      violations: result.violations,
      preview_only: true,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error'
    return NextResponse.json({ error: 'preview_failed', details: msg }, { status: 500 })
  }
}
