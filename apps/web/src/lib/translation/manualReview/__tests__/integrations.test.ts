/**
 * Integration helper tests.
 *
 * These tests exercise the pure-logic surface of integrations.ts:
 *   - gateInputFromSignals: signal-shape translation
 *   - routePipelineToManualReview: routing decision when ticket creation
 *     is mocked
 *   - getOpenManualReviewForSession: render-gate logic when Supabase
 *     responses are mocked
 *
 * No real Supabase, no real network. We mock @/lib/supabase/admin so the
 * route helpers call into our stub.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
// IMPORTANT: vi.mock factories must be self-contained. We declare a module-
// scoped mutable state object that the factory reads via closure.

interface MockState {
  // Open ticket query
  openTicketRows: Array<{ id: string; status: string; updated_at?: string; created_at?: string }>
  openTicketError: { message: string } | null

  // findOpenTicket inside createManualReviewTicket
  existingForCreate: Array<{ id: string; status: string; reasons: string[] | null; priority: string | null }>

  // Last insert into manual_review_queue + events
  insertCalls: Array<{ table: string; row: Record<string, unknown> }>
  updateCalls: Array<{ table: string; payload: Record<string, unknown>; eqId?: string }>
}

const state: MockState = {
  openTicketRows: [],
  openTicketError: null,
  existingForCreate: [],
  insertCalls: [],
  updateCalls: [],
}

vi.mock('@/lib/supabase/admin', () => {
  type SBResp<T> = Promise<{ data: T; error: null | { message: string } }>

  const builder = (table: string) => {
    let _select = ''
    let _eq: Record<string, unknown> = {}
    let _in: Record<string, unknown> = {}
    let _order: { col: string; desc: boolean } | null = null
    let _limit = 0
    let _action: 'select' | 'insert' | 'update' = 'select'
    let _payload: Record<string, unknown> | null = null

    const exec = async (): SBResp<unknown> => {
      if (_action === 'select') {
        if (table === 'manual_review_queue') {
          // Distinguish open-ticket query (used by getOpenManualReviewForSession)
          // from findOpenTicket inside createManualReviewTicket (uses .in('status', ...))
          if (Object.keys(_in).length > 0 && (_in['status'] as string[])?.length > 0) {
            // findOpenTicket path
            return { data: state.existingForCreate, error: null }
          }
          // open-ticket query for render gate: returns most-recent
          if (state.openTicketError) return { data: null, error: state.openTicketError }
          return { data: state.openTicketRows, error: null }
        }
        return { data: [], error: null }
      }
      if (_action === 'insert') {
        state.insertCalls.push({ table, row: _payload ?? {} })
        if (_select.includes('id')) {
          return { data: { id: `tkt_${state.insertCalls.length}` }, error: null }
        }
        return { data: null, error: null }
      }
      if (_action === 'update') {
        state.updateCalls.push({ table, payload: _payload ?? {}, eqId: _eq['id'] as string })
        return { data: null, error: null }
      }
      return { data: null, error: null }
    }

    const chain: Record<string, unknown> = {
      // Only initialise to 'select' if no write action was set.
      select: (s: string) => { _select = s; if (_action !== 'insert' && _action !== 'update') _action = 'select'; return chain },
      insert: (p: Record<string, unknown>) => { _payload = p; _action = 'insert'; return chain },
      update: (p: Record<string, unknown>) => { _payload = p; _action = 'update'; return chain },
      eq:     (k: string, v: unknown) => { _eq[k] = v; return chain },
      in:     (k: string, vs: unknown[]) => { _in[k] = vs; return chain },
      order:  (col: string, opts?: { ascending?: boolean }) => { _order = { col, desc: opts?.ascending === false }; return chain },
      limit:  (n: number) => { _limit = n; return chain },
      single: async () => exec(),
      then:   (resolve: (v: unknown) => unknown) => exec().then(resolve),
    }
    void _order; void _limit
    return chain
  }

  return {
    createAdminSupabaseClient: () => ({
      from: (table: string) => builder(table),
    }),
  }
})

// ── Imports under test (after mocks) ────────────────────────────────────────

import {
  gateInputFromSignals,
  routePipelineToManualReview,
  getOpenManualReviewForSession,
} from '../integrations'

beforeEach(() => {
  state.openTicketRows = []
  state.openTicketError = null
  state.existingForCreate = []
  state.insertCalls = []
  state.updateCalls = []
})

// ── gateInputFromSignals ─────────────────────────────────────────────────────

describe('gateInputFromSignals', () => {
  it('translates retakeExhausted to imageQuality.failed', () => {
    const out = gateInputFromSignals({
      sessionId: 'sess1',
      retakeExhausted: true,
    })
    expect(out.imageQuality).toEqual({ failed: true, retries: 999 })
  })

  it('passes through explicit imageQuality', () => {
    const out = gateInputFromSignals({
      sessionId: 'sess1',
      imageQuality: { failed: true, retries: 1 },
    })
    expect(out.imageQuality).toEqual({ failed: true, retries: 1 })
  })

  it('preserves criticalFieldResults shape', () => {
    const out = gateInputFromSignals({
      sessionId: 'sess1',
      criticalFieldResults: [
        { fieldKey: 'series', present: true, hasEvidence: true },
        { fieldKey: 'number', present: false, hasEvidence: false },
      ],
    })
    expect(out.criticalFieldResults).toHaveLength(2)
    expect(out.criticalFieldResults?.[1].present).toBe(false)
  })
})

// ── routePipelineToManualReview ──────────────────────────────────────────────

describe('routePipelineToManualReview', () => {
  it('does not create a ticket when router says no review needed', async () => {
    const r = await routePipelineToManualReview({
      sessionId: 'sess-ok',
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      ocrConfidence: 0.95,
      imageQuality: { failed: false, retries: 0 },
      criticalFieldResults: [
        { fieldKey: 'series', present: true, hasEvidence: true },
        { fieldKey: 'number', present: true, hasEvidence: true },
      ],
    })
    expect(r.routed).toBe(false)
    expect(r.ticketCreated).toBe(false)
    expect(state.insertCalls.find(c => c.table === 'manual_review_queue')).toBeUndefined()
  })

  it('creates a ticket on unknown document type', async () => {
    const r = await routePipelineToManualReview({
      sessionId: 'sess-unknown',
      documentType: '',
    })
    expect(r.routed).toBe(true)
    expect(r.reasons).toContain('unknown_document_type')
    expect(r.ticketCreated).toBe(true)
    const qInsert = state.insertCalls.find(c => c.table === 'manual_review_queue')
    expect(qInsert).toBeDefined()
    expect(qInsert?.row.session_id).toBe('sess-unknown')
    expect(qInsert?.row.status).toBe('queued')
  })

  it('creates a ticket on missing critical fields', async () => {
    const r = await routePipelineToManualReview({
      sessionId: 'sess-mc',
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      criticalFieldResults: [
        { fieldKey: 'series', present: true, hasEvidence: true },
        { fieldKey: 'number', present: false, hasEvidence: false },
      ],
    })
    expect(r.routed).toBe(true)
    expect(r.reasons).toContain('missing_critical_fields')
    expect(r.ticketCreated).toBe(true)
  })

  it('creates a ticket on low classifier confidence', async () => {
    const r = await routePipelineToManualReview({
      sessionId: 'sess-low',
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 0.5,
    })
    expect(r.routed).toBe(true)
    expect(r.reasons).toContain('low_classification_confidence')
  })

  it('writes a manual_review_events row alongside the ticket', async () => {
    await routePipelineToManualReview({
      sessionId: 'sess-evt',
      documentType: '',
    })
    const evt = state.insertCalls.find(c => c.table === 'manual_review_events')
    expect(evt).toBeDefined()
    expect(evt?.row.event_type).toBe('manual_review_queued')
  })

  it('reuses an open ticket instead of creating a duplicate', async () => {
    state.existingForCreate = [
      { id: 'existing-1', status: 'queued', reasons: ['low_ocr_confidence'], priority: 'normal' },
    ]
    const r = await routePipelineToManualReview({
      sessionId: 'sess-idemp',
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'draft',
      classifierConfidence: 1,
    })
    expect(r.routed).toBe(true)
    expect(r.ticketId).toBe('existing-1')
    // No new INSERT into manual_review_queue (only the events INSERT happens).
    const qInserts = state.insertCalls.filter(c => c.table === 'manual_review_queue')
    expect(qInserts).toHaveLength(0)
    // Update should have happened to merge reasons / priority.
    const upd = state.updateCalls.find(c => c.table === 'manual_review_queue')
    expect(upd).toBeDefined()
  })
})

// ── getOpenManualReviewForSession (render gate) ──────────────────────────────

describe('getOpenManualReviewForSession', () => {
  it('returns open=false when no rows', async () => {
    state.openTicketRows = []
    const r = await getOpenManualReviewForSession('sess-empty')
    expect(r.open).toBe(false)
  })

  it('returns open=true for queued ticket', async () => {
    state.openTicketRows = [{ id: 't1', status: 'queued' }]
    const r = await getOpenManualReviewForSession('sess1')
    expect(r.open).toBe(true)
    expect(r.status).toBe('queued')
    expect(r.userMessageKey).toBe('mr.user.in_progress')
  })

  it('returns open=true for v0 pending (canonicalized)', async () => {
    state.openTicketRows = [{ id: 't1', status: 'pending' }]
    const r = await getOpenManualReviewForSession('sess1')
    expect(r.open).toBe(true)
  })

  it('returns open=true for needs_user_clarification with awaiting_you message', async () => {
    state.openTicketRows = [{ id: 't1', status: 'needs_user_clarification' }]
    const r = await getOpenManualReviewForSession('sess1')
    expect(r.open).toBe(true)
    expect(r.userMessageKey).toBe('mr.user.awaiting_you')
  })

  it('returns open=false for approved_for_render (render allowed)', async () => {
    state.openTicketRows = [{ id: 't1', status: 'approved_for_render' }]
    const r = await getOpenManualReviewForSession('sess1')
    expect(r.open).toBe(false)
  })

  it('returns open=false for completed', async () => {
    state.openTicketRows = [{ id: 't1', status: 'completed' }]
    const r = await getOpenManualReviewForSession('sess1')
    expect(r.open).toBe(false)
  })

  it('returns open=false for rejected (operator-closed)', async () => {
    state.openTicketRows = [{ id: 't1', status: 'rejected' }]
    const r = await getOpenManualReviewForSession('sess1')
    expect(r.open).toBe(false)
  })

  it('returns open=false on DB error (fail-open by design)', async () => {
    state.openTicketError = { message: 'boom' }
    const r = await getOpenManualReviewForSession('sess1')
    expect(r.open).toBe(false)
  })

  it('returns open=false for empty sessionId', async () => {
    const r = await getOpenManualReviewForSession('')
    expect(r.open).toBe(false)
  })
})
