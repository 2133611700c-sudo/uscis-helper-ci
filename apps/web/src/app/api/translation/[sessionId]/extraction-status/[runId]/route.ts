/**
 * GET /api/translation/[sessionId]/extraction-status/[runId]
 *
 * Polling endpoint for async OCR extraction jobs.
 * Returns the current state of an extraction_runs row.
 *
 * Response shapes by status:
 *
 *   queued / processing:
 *     { ok: true, status: 'queued'|'processing', extraction_run_id, session_id }
 *
 *   completed:
 *     { ok: true, status: 'completed', extraction_run_id, session_id,
 *       provider, confidence, warnings, fields_count,
 *       next_step: '/review URL' }
 *
 *   retake_required:
 *     { ok: true, status: 'retake_required', extraction_run_id, session_id,
 *       user_message, retake_count, max_retakes, image_quality }
 *
 *   manual_review_required | failed:
 *     { ok: true, status: 'manual_review_required'|'failed', extraction_run_id,
 *       session_id, user_message }
 *
 * The UI should poll every 3 seconds until status is terminal
 * (completed | retake_required | manual_review_required | failed).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const TERMINAL_STATUSES = ['completed', 'retake_required', 'manual_review_required', 'failed']
const MAX_RETAKES = 2

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; runId: string }> }
) {
  const { sessionId, runId } = await params

  if (!sessionId || !runId) {
    return NextResponse.json(
      { ok: false, error: 'sessionId and runId required' },
      { status: 400 }
    )
  }

  const supabase = createAdminSupabaseClient()

  // Verify session exists (prevents leaking run data across sessions)
  const { data: session } = await supabase
    .from('translation_sessions')
    .select('session_id')
    .eq('session_id', sessionId)
    .single()

  if (!session) {
    return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 })
  }

  // Load extraction run — must belong to this session
  const { data: run, error } = await supabase
    .from('extraction_runs')
    .select('id, session_id, status, provider, confidence, warnings, raw_text, image_quality, retake_count, error_message, started_at, completed_at, created_at')
    .eq('id', runId)
    .eq('session_id', sessionId)
    .single()

  if (error || !run) {
    return NextResponse.json(
      { ok: false, error: 'Extraction run not found' },
      { status: 404 }
    )
  }

  const isTerminal = TERMINAL_STATUSES.includes(run.status)

  // Base response fields
  const base = {
    ok: true,
    extraction_run_id: run.id,
    session_id: run.session_id,
    status: run.status,
    is_terminal: isTerminal,
    started_at: run.started_at,
    completed_at: run.completed_at,
    created_at: run.created_at,
  }

  // Status-specific extras
  if (run.status === 'completed') {
    // Count fields that were written for this session
    const { count: fieldsCount } = await supabase
      .from('extracted_fields')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)

    return NextResponse.json({
      ...base,
      provider: run.provider,
      confidence: run.confidence,
      warnings: run.warnings ?? [],
      fields_count: fieldsCount ?? 0,
      next_step: `/en/services/translate-document/session/${sessionId}/review`,
    })
  }

  if (run.status === 'retake_required') {
    return NextResponse.json({
      ...base,
      user_message: run.error_message ?? 'Please retake the photo for better results.',
      retake_count: run.retake_count ?? 0,
      max_retakes: MAX_RETAKES,
      image_quality: run.image_quality,
    })
  }

  if (run.status === 'manual_review_required' || run.status === 'failed') {
    return NextResponse.json({
      ...base,
      user_message:
        run.error_message ??
        'Automatic extraction could not read your document. Please re-upload a clearer photo.',
    })
  }

  // queued or processing — return minimal polling response
  return NextResponse.json(base)
}
