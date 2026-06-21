/**
 * fakeOrdersDb — an in-process faithful re-implementation of the Phase 2 Supabase
 * surface (translation_orders_v2 + events + document_artifacts + delivery_outbox +
 * the SECURITY DEFINER RPCs + BEFORE-UPDATE triggers + storage bucket) for vitest.
 *
 * WHY: the production TS modules (lib/translation/orders, the delivery worker, the
 * operator Server Actions) talk to Supabase via createClient(...).from(...) and
 * .rpc(...). To exercise the REAL production code paths behaviorally without a live
 * DB, this fake mirrors the EXACT invariants encoded in the SQL migrations:
 *   - transition_translation_order: actor required, advisory-serialized, expected
 *     status+version asserted, allowed-transition map, version bump, event append.
 *   - the BEFORE UPDATE guard: status/version immutable outside the RPC; canonical
 *     rebind forbidden; checkout immutable.
 *   - append-only events (no update/delete except guarded cleanup).
 *   - create_artifact_and_enqueue: ONE logical txn (artifact insert + 2 transitions
 *     + outbox insert); UNIQUE idempotency_key; all-or-nothing rollback.
 *   - claim_outbox_event: claims ONE due row, increments attempt_count; a claimed
 *     row is no longer due (the SKIP-LOCKED exactly-once gate).
 *   - immutable artifacts.
 *
 * This is TEST-ONLY. The error MESSAGES match the SQL so classifyOrderError() (the
 * real production error mapper) routes them identically.
 *
 * PII: synthetic data only. The fake never logs.
 */
import { randomUUID } from 'crypto'

const ALLOWED_TRANSITIONS = new Set<string>([
  'queued>assigned', 'queued>cancelled',
  'assigned>in_review', 'assigned>queued', 'assigned>cancelled',
  'in_review>needs_user_clarification', 'in_review>approved_for_render', 'in_review>cancelled',
  'needs_user_clarification>in_review', 'needs_user_clarification>cancelled',
  'approved_for_render>artifact_generated', 'approved_for_render>in_review',
  'artifact_generated>delivery_pending',
  'delivery_pending>delivered', 'delivery_pending>delivery_failed',
  'delivery_failed>delivery_pending', 'delivery_failed>cancelled',
])

interface OrderRow {
  id: string
  checkout_session_id: string
  canonical_document_id: string | null
  product: string
  verified_recipient_email: string | null
  document_type: string | null
  source_language: string | null
  locale: string | null
  status: string
  version: number
  legacy: boolean
  created_at: string
  updated_at: string
  paid_at: string | null
  completed_at: string | null
  expires_at: string | null
}

interface EventRow {
  id: string
  order_id: string
  from_status: string | null
  to_status: string
  version: number
  actor: string
  reason: string | null
  metadata: unknown
  created_at: string
}

interface ArtifactRow {
  id: string
  order_id: string
  canonical_document_id: string | null
  base_canonical_hash: string | null
  resolved_canonical_hash: string | null
  override_set_hash: string | null
  override_version: number | null
  canonical_schema_version: string | null
  renderer_version: string | null
  storage_bucket: string
  storage_key: string
  artifact_sha256: string
  mime_type: string
  byte_size: number
  artifact_version: number
  generated_by: string
  generated_at: string
  metadata: unknown
  delivery_status: string | null
}

interface OutboxRow {
  id: string
  order_id: string
  artifact_id: string
  destination_type: string
  recipient_ref: string | null
  idempotency_key: string
  state: string
  attempt_count: number
  next_attempt_at: string | null
  last_error_code: string | null
  created_at: string
  delivered_at: string | null
}

interface ProcessedEventRow {
  stripe_event_id: string
  event_type: string
  checkout_session_id: string | null
  order_id: string | null
  result_code: string | null
  processed_at: string
}

export interface FakeDbState {
  orders: Map<string, OrderRow>
  events: EventRow[]
  artifacts: ArtifactRow[]
  outbox: OutboxRow[]
  /** Stripe webhook processed-events dedupe ledger (idempotency on the Stripe event id). */
  processedEvents: Map<string, ProcessedEventRow>
  storage: Map<string, Buffer> // `${bucket}/${key}` -> bytes
  recipientEvents: { order_id: string; event_type: string; actor: string; reason: string | null; metadata: unknown }[]
  /** Fault injection hooks (chaos tests). */
  faults: {
    failOutboxInsert?: boolean
    failStorageUpload?: boolean
    failArtifactInsert?: boolean
  }
}

export function makeFakeDbState(): FakeDbState {
  return {
    orders: new Map(),
    events: [],
    artifacts: [],
    outbox: [],
    processedEvents: new Map(),
    storage: new Map(),
    recipientEvents: [],
    faults: {},
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

// PostgREST-ish error wrapper
function pgError(message: string, code?: string) {
  return { data: null, error: { message, code } }
}

/**
 * Build a mock that matches the shape used by createClient(url,key).
 * The production code uses: .from(table).insert/select/update/.eq/.is/.in/.order/.limit/.maybeSingle,
 * .rpc(name, args), and .storage.from(bucket).upload/download.
 */
export function makeFakeSupabase(state: FakeDbState) {
  // ── RPC implementations (mirror the SQL) ──────────────────────────────────
  function rpcTransition(args: Record<string, unknown>) {
    const orderId = args.p_order_id as string
    const expectedVersion = args.p_expected_version as number
    const expectedStatus = args.p_expected_status as string
    const toStatus = args.p_to_status as string
    const actor = args.p_actor as string
    const reason = (args.p_reason as string) ?? null
    const metadata = args.p_metadata ?? {}

    if (actor == null || String(actor).trim() === '') {
      return pgError('ORDER_ACTOR_REQUIRED: actor must be non-null')
    }
    const row = state.orders.get(orderId)
    if (!row) return pgError(`ORDER_NOT_FOUND: ${orderId}`)
    if (row.status !== expectedStatus) {
      return pgError(`ORDER_STATE_CONFLICT expected=${expectedStatus} current=${row.status}`)
    }
    if (row.version !== expectedVersion) {
      return pgError(`ORDER_VERSION_CONFLICT expected=${expectedVersion} current=${row.version}`)
    }
    if (!ALLOWED_TRANSITIONS.has(`${row.status}>${toStatus}`)) {
      return pgError(`ORDER_INVALID_TRANSITION from=${row.status} to=${toStatus}`)
    }
    const fromStatus = row.status
    row.status = toStatus
    row.version = row.version + 1
    row.updated_at = nowIso()
    if (toStatus === 'assigned' && row.paid_at == null) row.paid_at = nowIso()
    if (toStatus === 'delivered') row.completed_at = nowIso()
    state.events.push({
      id: randomUUID(),
      order_id: orderId,
      from_status: fromStatus,
      to_status: toStatus,
      version: row.version,
      actor,
      reason,
      metadata,
      created_at: nowIso(),
    })
    return { data: [{ order_id: orderId, new_status: toStatus, new_version: row.version }], error: null }
  }

  function rpcCreateArtifactAndEnqueue(args: Record<string, unknown>) {
    const orderId = args.p_order_id as string
    const actor = args.p_actor as string
    if (actor == null || String(actor).trim() === '') return pgError('ORDER_ACTOR_REQUIRED')
    const idempotencyKey = args.p_idempotency_key as string

    // Duplicate idempotency_key → UNIQUE violation, whole thing rolls back.
    if (state.outbox.some((o) => o.idempotency_key === idempotencyKey)) {
      return pgError('duplicate key value violates unique constraint "delivery_outbox_idempotency_key"', '23505')
    }
    // Snapshot for all-or-nothing rollback.
    const order = state.orders.get(orderId)
    if (!order) return pgError(`ORDER_NOT_FOUND: ${orderId}`)
    const snapStatus = order.status
    const snapVersion = order.version
    const artifactsBefore = state.artifacts.length
    const eventsBefore = state.events.length

    const rollback = () => {
      order.status = snapStatus
      order.version = snapVersion
      state.artifacts.length = artifactsBefore
      state.events.length = eventsBefore
    }

    if (state.faults.failArtifactInsert) {
      return pgError('CHAOS_ARTIFACT_INSERT_FAILED')
    }

    const nextVer = state.artifacts.filter((a) => a.order_id === orderId)
      .reduce((mx, a) => Math.max(mx, a.artifact_version), 0) + 1
    const artifactId = randomUUID()
    state.artifacts.push({
      id: artifactId,
      order_id: orderId,
      canonical_document_id: (args.p_canonical_document_id as string) ?? null,
      base_canonical_hash: (args.p_base_canonical_hash as string) ?? null,
      resolved_canonical_hash: (args.p_resolved_canonical_hash as string) ?? null,
      override_set_hash: (args.p_override_set_hash as string) ?? null,
      override_version: (args.p_override_version as number) ?? null,
      canonical_schema_version: (args.p_canonical_schema_version as string) ?? null,
      renderer_version: (args.p_renderer_version as string) ?? null,
      storage_bucket: args.p_storage_bucket as string,
      storage_key: args.p_storage_key as string,
      artifact_sha256: args.p_artifact_sha256 as string,
      mime_type: args.p_mime_type as string,
      byte_size: Number(args.p_byte_size),
      artifact_version: nextVer,
      generated_by: args.p_generated_by as string,
      generated_at: nowIso(),
      metadata: args.p_artifact_metadata ?? null,
      delivery_status: 'pending',
    })

    // Hop 1: approved_for_render -> artifact_generated
    const h1 = rpcTransition({
      p_order_id: orderId, p_expected_version: args.p_expected_version,
      p_expected_status: 'approved_for_render', p_to_status: 'artifact_generated',
      p_actor: actor, p_reason: 'artifact created', p_metadata: { artifact_version: nextVer },
    })
    if (h1.error) { rollback(); return h1 }
    const v1 = (h1.data as { new_version: number }[])[0].new_version

    // Hop 2: artifact_generated -> delivery_pending
    const h2 = rpcTransition({
      p_order_id: orderId, p_expected_version: v1,
      p_expected_status: 'artifact_generated', p_to_status: 'delivery_pending',
      p_actor: actor, p_reason: 'enqueued for delivery', p_metadata: { artifact_id: artifactId },
    })
    if (h2.error) { rollback(); return h2 }
    const v2 = (h2.data as { new_version: number }[])[0].new_version

    if (state.faults.failOutboxInsert) {
      rollback()
      return pgError('CHAOS_OUTBOX_INSERT_FAILED')
    }

    const outboxId = randomUUID()
    state.outbox.push({
      id: outboxId,
      order_id: orderId,
      artifact_id: artifactId,
      destination_type: (args.p_destination_type as string) ?? 'email',
      recipient_ref: (args.p_recipient_ref as string) ?? null,
      idempotency_key: idempotencyKey,
      state: 'pending',
      attempt_count: 0,
      next_attempt_at: nowIso(),
      last_error_code: null,
      created_at: nowIso(),
      delivered_at: null,
    })
    return { data: [{ artifact_id: artifactId, outbox_id: outboxId, new_version: v2 }], error: null }
  }

  function rpcClaimOutbox(args: Record<string, unknown>) {
    const worker = args.p_worker as string
    if (worker == null || String(worker).trim() === '') return pgError('OUTBOX_WORKER_REQUIRED')
    const now = Date.now()
    const due = state.outbox
      .filter((o) => (o.state === 'pending' || o.state === 'retry') &&
        (o.next_attempt_at == null || new Date(o.next_attempt_at).getTime() <= now))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    if (!due) return { data: [], error: null }
    due.state = 'claimed'
    due.attempt_count += 1
    due.last_error_code = null
    return {
      data: [{
        id: due.id, order_id: due.order_id, artifact_id: due.artifact_id,
        destination_type: due.destination_type, recipient_ref: due.recipient_ref,
        idempotency_key: due.idempotency_key, attempt_count: due.attempt_count,
      }],
      error: null,
    }
  }

  function rpcPhase2Cleanup(args: Record<string, unknown>) {
    const prefix = args.p_prefix as string
    if (!prefix.startsWith('PHASE2_TEST_')) {
      return pgError('PHASE2_ADMIN_CLEANUP_FORBIDDEN: prefix must start with PHASE2_TEST_')
    }
    let deleted = 0
    for (const [id, o] of state.orders) {
      if (o.checkout_session_id.startsWith(prefix)) {
        state.orders.delete(id)
        deleted++
      }
    }
    for (const [eid, ev] of state.processedEvents) {
      if (eid.startsWith(prefix) || (ev.checkout_session_id ?? '').startsWith(prefix)) {
        state.processedEvents.delete(eid)
      }
    }
    return { data: deleted, error: null }
  }

  // record_stripe_processed_event: INSERT ON CONFLICT DO NOTHING on the event id.
  function rpcRecordProcessedEvent(args: Record<string, unknown>) {
    const eventId = args.p_stripe_event_id as string
    if (eventId == null || String(eventId).trim() === '') {
      return pgError('STRIPE_EVENT_ID_REQUIRED')
    }
    if (state.processedEvents.has(eventId)) {
      return { data: [{ inserted: false }], error: null }
    }
    state.processedEvents.set(eventId, {
      stripe_event_id: eventId,
      event_type: args.p_event_type as string,
      checkout_session_id: (args.p_checkout_session_id as string) ?? null,
      order_id: (args.p_order_id as string) ?? null,
      result_code: (args.p_result_code as string) ?? null,
      processed_at: nowIso(),
    })
    return { data: [{ inserted: true }], error: null }
  }

  // ── from(table) query builder ─────────────────────────────────────────────
  function from(table: string) {
    return new TableQuery(state, table)
  }

  return {
    from,
    rpc(name: string, args: Record<string, unknown>) {
      switch (name) {
        case 'transition_translation_order': return Promise.resolve(rpcTransition(args))
        case 'create_artifact_and_enqueue': return Promise.resolve(rpcCreateArtifactAndEnqueue(args))
        case 'claim_outbox_event': return Promise.resolve(rpcClaimOutbox(args))
        case 'record_stripe_processed_event': return Promise.resolve(rpcRecordProcessedEvent(args))
        case 'phase2_admin_cleanup': return Promise.resolve(rpcPhase2Cleanup(args))
        default: return Promise.resolve(pgError(`unknown rpc ${name}`))
      }
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(key: string, bytes: Buffer | Uint8Array) {
            if (state.faults.failStorageUpload) {
              return { data: null, error: { message: 'CHAOS_STORAGE_UPLOAD_FAILED' } }
            }
            state.storage.set(`${bucket}/${key}`, Buffer.from(bytes))
            return { data: { path: key }, error: null }
          },
          async download(key: string) {
            const buf = state.storage.get(`${bucket}/${key}`)
            if (!buf) return { data: null, error: { message: 'Object not found' } }
            return {
              data: { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) },
              error: null,
            }
          },
        }
      },
    },
  }
}

/** Minimal chainable query builder mirroring the PostgREST calls the product uses. */
class TableQuery {
  private filters: { col: string; op: string; val: unknown }[] = []
  private orderCol: string | null = null
  private orderAsc = true
  private limitN: number | null = null
  private mode: 'select' | 'insert' | 'update' = 'select'
  private insertRow: Record<string, unknown> | null = null
  private updateRow: Record<string, unknown> | null = null

  constructor(private state: FakeDbState, private table: string) {}

  insert(row: Record<string, unknown>) {
    this.mode = 'insert'
    this.insertRow = row
    return this
  }
  update(row: Record<string, unknown>) {
    this.mode = 'update'
    this.updateRow = row
    return this
  }
  select(_cols?: string) { return this }
  eq(col: string, val: unknown) { this.filters.push({ col, op: 'eq', val }); return this }
  is(col: string, val: unknown) { this.filters.push({ col, op: 'is', val }); return this }
  in(col: string, val: unknown[]) { this.filters.push({ col, op: 'in', val }); return this }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col
    this.orderAsc = opts?.ascending ?? true
    return this
  }
  limit(n: number) { this.limitN = n; return this }

  private rows(): Record<string, unknown>[] {
    if (this.table === 'translation_orders_v2') return [...this.state.orders.values()] as unknown as Record<string, unknown>[]
    if (this.table === 'document_artifacts') return this.state.artifacts as unknown as Record<string, unknown>[]
    if (this.table === 'delivery_outbox') return this.state.outbox as unknown as Record<string, unknown>[]
    if (this.table === 'translation_order_events') return this.state.events as unknown as Record<string, unknown>[]
    if (this.table === 'stripe_processed_events') return [...this.state.processedEvents.values()] as unknown as Record<string, unknown>[]
    return []
  }

  private applyFilters(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    let out = rows
    for (const f of this.filters) {
      out = out.filter((r) => {
        if (f.op === 'eq') return r[f.col] === f.val
        if (f.op === 'is') return r[f.col] == null && f.val == null ? true : r[f.col] === f.val
        if (f.op === 'in') return (f.val as unknown[]).includes(r[f.col])
        return true
      })
    }
    if (this.orderCol) {
      out = [...out].sort((a, b) => {
        const av = a[this.orderCol!] as string | number
        const bv = b[this.orderCol!] as string | number
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return this.orderAsc ? cmp : -cmp
      })
    }
    if (this.limitN != null) out = out.slice(0, this.limitN)
    return out
  }

  // ── INSERT path ───────────────────────────────────────────────────────────
  private doInsert(): { data: unknown; error: { message: string; code?: string } | null } {
    if (this.table === 'translation_orders_v2') {
      const csid = this.insertRow!.checkout_session_id as string
      if ([...this.state.orders.values()].some((o) => o.checkout_session_id === csid)) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }
      }
      const id = randomUUID()
      const row: OrderRow = {
        id,
        checkout_session_id: csid,
        canonical_document_id: (this.insertRow!.canonical_document_id as string) ?? null,
        product: (this.insertRow!.product as string) ?? 'translation',
        verified_recipient_email: (this.insertRow!.verified_recipient_email as string) ?? null,
        document_type: (this.insertRow!.document_type as string) ?? null,
        source_language: (this.insertRow!.source_language as string) ?? null,
        locale: (this.insertRow!.locale as string) ?? null,
        status: 'queued',
        version: 0,
        legacy: (this.insertRow!.legacy as boolean) ?? false,
        created_at: nowIso(),
        updated_at: nowIso(),
        paid_at: null,
        completed_at: null,
        expires_at: (this.insertRow!.expires_at as string) ?? null,
      }
      this.state.orders.set(id, row)
      return { data: { ...row }, error: null }
    }
    if (this.table === 'translation_order_events') {
      // recipient_changed audit insert from changeRecipient
      this.state.recipientEvents.push({
        order_id: this.insertRow!.order_id as string,
        event_type: this.insertRow!.event_type as string,
        actor: this.insertRow!.actor as string,
        reason: (this.insertRow!.reason as string) ?? null,
        metadata: this.insertRow!.metadata ?? null,
      })
      return { data: null, error: null }
    }
    return { data: null, error: null }
  }

  // ── UPDATE path (guarded like the BEFORE UPDATE trigger) ───────────────────
  private doUpdate(): { data: unknown; error: { message: string; code?: string } | null } {
    if (this.table === 'translation_orders_v2') {
      const targets = this.applyFilters([...this.state.orders.values()] as unknown as Record<string, unknown>[]) as unknown as OrderRow[]
      for (const row of targets) {
        const u = this.updateRow!
        // canonical binding: NULL -> value only (rebind forbidden)
        if ('canonical_document_id' in u) {
          if (row.canonical_document_id != null && u.canonical_document_id !== row.canonical_document_id) {
            return { data: null, error: { message: 'ORDER_CANONICAL_REBIND_FORBIDDEN' } }
          }
          row.canonical_document_id = u.canonical_document_id as string
        }
        if ('legacy' in u) row.legacy = u.legacy as boolean
        if ('verified_recipient_email' in u) row.verified_recipient_email = u.verified_recipient_email as string
        // Direct status/version change is FORBIDDEN by the trigger.
        if ('status' in u && u.status !== row.status) {
          return { data: null, error: { message: 'ORDER_STATUS_DIRECT_CHANGE_FORBIDDEN: use transition_translation_order()' } }
        }
        if ('version' in u && u.version !== row.version) {
          return { data: null, error: { message: 'ORDER_VERSION_DIRECT_CHANGE_FORBIDDEN' } }
        }
      }
      return { data: null, error: null }
    }
    if (this.table === 'delivery_outbox') {
      const targets = this.applyFilters(this.state.outbox as unknown as Record<string, unknown>[]) as unknown as OutboxRow[]
      for (const row of targets) {
        Object.assign(row, this.updateRow)
      }
      return { data: null, error: null }
    }
    return { data: null, error: null }
  }

  // ── Terminals ──────────────────────────────────────────────────────────────
  async maybeSingle() {
    if (this.mode === 'insert') {
      const r = this.doInsert()
      return r
    }
    const rows = this.applyFilters(this.rows())
    return { data: rows[0] ?? null, error: null }
  }
  async single() {
    return this.maybeSingle()
  }
  // For .select('*').eq(...).order(...) returning an array (listOrderArtifacts).
  then(resolve: (v: { data: unknown[]; error: null }) => void) {
    if (this.mode === 'update') {
      const r = this.doUpdate()
      resolve({ data: (r.error ? [] : []) as unknown[], error: r.error as null })
      return
    }
    if (this.mode === 'insert') {
      const r = this.doInsert()
      resolve({ data: [] as unknown[], error: r.error as null })
      return
    }
    const rows = this.applyFilters(this.rows())
    resolve({ data: rows, error: null })
  }
}
