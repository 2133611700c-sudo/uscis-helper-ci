/**
 * v5 remaining plan items — coverage for:
 *
 *   1. AdminAuditArtifact JSON-only builder
 *   2. Death certificate skeleton module + classifier aliases
 *   3. Identity anchor auto-feed (post-confirmation only)
 *   4. Master agent system prompt loader (helper, not wired to passport)
 */

import { describe, it, expect, beforeEach } from 'vitest'

import { buildAdminAuditArtifact } from '../adminAudit/buildAdminAuditArtifact'

import { deathCertificateModule } from '../modules/deathCertificate.module'
import {
  findDocumentModule,
  getDocumentModule,
  listDocumentModules,
  isAutoDraftSupported,
} from '../modules/registry'
import { resolveDocumentModule } from '../modules/classifier'

import { applyIdentityAnchor } from '../identity/anchorAutoFeed'

import {
  loadAgentSystemPrompt,
  buildSystemMessageHeader,
  __resetAgentPromptCacheForTests,
} from '../agent/loadAgentSystemPrompt'

import { CERTIFICATION_VERSION } from '../certificationRecord'

import type {
  ExtractedField,
  PacketState,
  CertificationRecord,
} from '../types'
import type { ManualReviewTicket } from '../manualReview/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

function mkField(over: Partial<ExtractedField> = {}): ExtractedField {
  return {
    field: 'surname',
    source_label: 'Прізвище',
    source_zone: 'personal_data',
    bbox: [0.1, 0.1, 0.4, 0.15],
    raw_value: 'Шевченко',
    normalized_value: 'SHEVCHENKO',
    language_layer: 'uk',
    confidence: 0.97,
    review_required: false,
    ocr_ids: ['w12'],
    evidence_type: 'ocr_bbox',
    bbox_status: 'exact',
    user_corrected: false,
    ...over,
  }
}

function mkPacket(over: Partial<PacketState> = {}): PacketState {
  return {
    session_id: 'sess-abc12345',
    status: 'reviewed',
    document_type: 'ua_passport_booklet',
    controlling_spelling: {},
    uploaded_pages: 2,
    total_pages_declared: 16,
    extracted_fields: [],
    source_traces: [],
    user_corrections: [],
    certification_record: null,
    payment_confirmed: false,
    payment_checkout_id: null,
    qa_result: null,
    scope_title: 'English Translation of the Provided Ukrainian Internal Passport (Booklet) Pages (pages 1-2 of 16)',
    locale: 'en',
    created_at: '2026-05-09T00:00:00Z',
    updated_at: '2026-05-09T00:00:00Z',
    ...over,
  }
}

// ─── 1. Death certificate skeleton ───────────────────────────────────────────

describe('Death certificate module — skeleton', () => {
  it('is defined with status=draft and allowAutoPdf=false', () => {
    expect(deathCertificateModule.documentType).toBe('ua_death_certificate')
    expect(deathCertificateModule.status).toBe('draft')
    expect(deathCertificateModule.reviewPolicy.allowAutoPdf).toBe(false)
    expect(deathCertificateModule.reviewPolicy.requireUserConfirmation).toBe(true)
  })

  it('declares the v5-plan critical field skeleton', () => {
    const keys = deathCertificateModule.criticalFields.map(f => f.key)
    expect(keys).toEqual(
      expect.arrayContaining([
        'document_type',
        'certificate_series',
        'certificate_number',
        'deceased_surname',
        'deceased_given_name',
        'deceased_patronymic',
        'date_of_birth',
        'place_of_birth',
        'date_of_death',
        'place_of_death',
        'act_record_number',
        'act_record_date',
        'issuing_authority',
        'date_of_issue',
      ]),
    )
  })

  it('does NOT include cause_of_death in the auto-extraction skeleton', () => {
    const keys = deathCertificateModule.criticalFields.map(f => f.key)
    expect(keys).not.toContain('cause_of_death')
  })

  it('is registered: findDocumentModule resolves the canonical key', () => {
    expect(findDocumentModule('ua_death_certificate')).toBe(deathCertificateModule)
  })

  it('appears in listDocumentModules() output', () => {
    const types = listDocumentModules().map(m => m.documentType)
    expect(types).toContain('ua_death_certificate')
  })

  it('routes to manualReview because status is draft', () => {
    const m = getDocumentModule('ua_death_certificate')
    expect(m.documentType).toBe('manual_review_required')
  })

  it('isAutoDraftSupported is false for death certificate', () => {
    expect(isAutoDraftSupported('ua_death_certificate')).toBe(false)
  })

  it('classifier aliases route to manualReview (not the death module directly) because status=draft', () => {
    const aliases = [
      'death certificate',
      'certificate of death',
      'свідоцтво про смерть',
      'свидетельство о смерти',
      'смерть',
      'ua_death',
    ]
    for (const a of aliases) {
      const m = resolveDocumentModule(a, 1.0)
      expect(m.documentType).toBe('manual_review_required')
    }
  })
})

// ─── 2. Identity anchor auto-feed ────────────────────────────────────────────

describe('applyIdentityAnchor', () => {
  it('writes controlling spelling from confirmed intl-passport fields', () => {
    const packet = mkPacket()
    const r = applyIdentityAnchor({
      packet,
      sourceModuleType: 'ua_international_passport',
      confirmedFields: [
        mkField({ field: 'surname_latin',     normalized_value: 'SHEVCHENKO', confidence: 0.99 }),
        mkField({ field: 'given_names_latin', normalized_value: 'TARAS',      confidence: 0.99 }),
      ],
    })
    expect(r.applied.sort()).toEqual(['given_name', 'surname'])
    expect(r.packet.controlling_spelling).toMatchObject({
      surname: 'SHEVCHENKO',
      given_name: 'TARAS',
    })
    expect(r.conflicts).toHaveLength(0)
  })

  it('refuses unconfirmed fields (review_required=true)', () => {
    const packet = mkPacket()
    const r = applyIdentityAnchor({
      packet,
      sourceModuleType: 'ua_international_passport',
      confirmedFields: [
        mkField({ field: 'surname_latin', normalized_value: 'SHEVCHENKO', review_required: true }),
      ],
    })
    expect(r.applied).toHaveLength(0)
    expect(r.refused.find(x => x.reason === 'unconfirmed')).toBeDefined()
    expect(r.packet.controlling_spelling).toEqual({})
  })

  it('refuses low-confidence fields even when review_required=false', () => {
    const packet = mkPacket()
    const r = applyIdentityAnchor({
      packet,
      sourceModuleType: 'ua_international_passport',
      confirmedFields: [
        mkField({ field: 'surname_latin', normalized_value: 'SHEVCHENKO', confidence: 0.5 }),
      ],
    })
    expect(r.applied).toHaveLength(0)
    expect(r.refused.find(x => x.reason === 'low_confidence')).toBeDefined()
  })

  it('refuses when source module is not an anchor (e.g. passport booklet)', () => {
    const packet = mkPacket()
    const r = applyIdentityAnchor({
      packet,
      sourceModuleType: 'ua_internal_passport_booklet',
      confirmedFields: [
        mkField({ field: 'surname', normalized_value: 'SHEVCHENKO' }),
      ],
    })
    expect(r.applied).toHaveLength(0)
    expect(r.refused.find(x => x.reason === 'wrong_module')).toBeDefined()
    expect(r.packet.controlling_spelling).toEqual({})
  })

  it('flags conflict and does NOT overwrite an existing controlling spelling', () => {
    const packet = mkPacket({
      controlling_spelling: { surname: 'SHEVCHENKO' },
    })
    const r = applyIdentityAnchor({
      packet,
      sourceModuleType: 'ua_international_passport',
      confirmedFields: [
        mkField({ field: 'surname_latin', normalized_value: 'SHEVCHEN', confidence: 0.99 }),
      ],
    })
    expect(r.applied).toHaveLength(0)
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0]).toMatchObject({
      key: 'surname',
      existing: 'SHEVCHENKO',
      candidate: 'SHEVCHEN',
      source: 'ua_international_passport',
    })
    // Existing value preserved.
    expect(r.packet.controlling_spelling.surname).toBe('SHEVCHENKO')
  })

  it('idempotent: writing the same value twice produces no conflict', () => {
    const packet = mkPacket({ controlling_spelling: { surname: 'SHEVCHENKO' } })
    const r = applyIdentityAnchor({
      packet,
      sourceModuleType: 'ua_id_card',
      confirmedFields: [
        mkField({ field: 'surname_latin', normalized_value: 'SHEVCHENKO', confidence: 0.99 }),
      ],
    })
    expect(r.conflicts).toHaveLength(0)
    expect(r.packet.controlling_spelling.surname).toBe('SHEVCHENKO')
  })

  it('skips empty values without crashing', () => {
    const packet = mkPacket()
    const r = applyIdentityAnchor({
      packet,
      sourceModuleType: 'ua_international_passport',
      confirmedFields: [
        mkField({ field: 'surname_latin', normalized_value: '   ' }),
      ],
    })
    expect(r.applied).toHaveLength(0)
    expect(r.refused.find(x => x.reason === 'empty_value')).toBeDefined()
  })

  it('does not mutate the input packet', () => {
    const packet = mkPacket()
    Object.freeze(packet)
    Object.freeze(packet.controlling_spelling)
    expect(() =>
      applyIdentityAnchor({
        packet,
        sourceModuleType: 'ua_international_passport',
        confirmedFields: [
          mkField({ field: 'surname_latin', normalized_value: 'SHEVCHENKO' }),
        ],
      }),
    ).not.toThrow()
  })
})

// ─── 3. Master agent system prompt helper ────────────────────────────────────

describe('loadAgentSystemPrompt', () => {
  beforeEach(() => __resetAgentPromptCacheForTests())

  it('loads the real prompt file from the repo root', () => {
    // Resolve from the test file's __dirname up to repo root.
    // __dirname here = .../apps/web/src/lib/translation/__tests__
    // repo root = ../../../../../../.. (7 up).
    const path = require('node:path')
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..')
    const text = loadAgentSystemPrompt(repoRoot)
    expect(text).not.toBeNull()
    expect(text!.length).toBeGreaterThan(50)
    // Sanity-check: the prompt mentions "Translation Agent" or v5 markers.
    expect(text!).toMatch(/Translation Agent|Messenginfo v5|priority order/i)
  })

  it('returns null when given a non-existent repo root', () => {
    const text = loadAgentSystemPrompt('/this/path/does/not/exist/anywhere')
    expect(text).toBeNull()
  })

  it('buildSystemMessageHeader wraps prompt in identifiable markers', () => {
    const path = require('node:path')
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..')
    const header = buildSystemMessageHeader(repoRoot)
    expect(header).toContain('SYSTEM_PROMPT_BEGIN')
    expect(header).toContain('SYSTEM_PROMPT_END')
    expect(header.endsWith('\n')).toBe(true)
  })

  it('buildSystemMessageHeader returns empty string when prompt is missing', () => {
    const header = buildSystemMessageHeader('/missing')
    expect(header).toBe('')
  })
})

describe('Master agent prompt is NOT wired into passport runtime', () => {
  it('passport extraction prompt does not import loadAgentSystemPrompt', () => {
    // Static-source check: the existing per-module extraction builders
    // must not depend on the master prompt loader (locked by task spec
    // CLOSE_REMAINING_V5_PLAN_ITEMS_LOW_RISK.master_agent_system_prompt = 4B).
    const fs = require('node:fs')
    const path = require('node:path')
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..')
    const extractionDir = path.join(repoRoot, 'apps/web/src/lib/translation/extraction')
    if (!fs.existsSync(extractionDir)) return
    const files: string[] = fs.readdirSync(extractionDir).filter((f: string) => f.endsWith('.ts'))
    for (const f of files) {
      const text = fs.readFileSync(path.join(extractionDir, f), 'utf-8') as string
      expect(text).not.toMatch(/loadAgentSystemPrompt|buildSystemMessageHeader/)
    }
  })
})

// ─── 4. AdminAuditArtifact builder ───────────────────────────────────────────

describe('buildAdminAuditArtifact', () => {
  function mkCert(): CertificationRecord {
    return {
      signer_full_name: 'Ivan Test',
      language_pair_confirmed: true,
      statement: 'I certify ... pursuant to 8 CFR §103.2(b)(3).',
      signature_typed_name: 'Ivan Test',
      signed_at: '2026-05-09T01:23:45Z',
      certification_version: CERTIFICATION_VERSION,
    }
  }

  function mkTicket(): ManualReviewTicket {
    // The ManualReviewTicket type may evolve; we only set fields the
    // builder actually reads.
    return {
      ticket_id: 't_42',
      session_id: 'sess-abc12345',
      reasons: ['missing_critical_fields'] as any,
      priority: 'normal' as any,
      created_at: '2026-05-09T01:00:00Z',
    } as any
  }

  it('produces a non-customer-visible artifact with field provenance', () => {
    const fields: ExtractedField[] = [
      mkField({
        field: 'series',
        source_label: 'Серія',
        normalized_value: 'СО',
        bbox: [0.05, 0.06, 0.10, 0.08],
        ocr_ids: ['w_series_1'],
        passes: ['visual_pass_1', 'visual_pass_2'],
      }),
      mkField({
        field: 'number',
        source_label: 'Номер',
        normalized_value: '478123',
        bbox: [0.11, 0.06, 0.20, 0.08],
        ocr_ids: ['w_num_1', 'w_num_2'],
        passes: ['visual_pass_1', 'visual_pass_2', 'digit_shape_compare'],
      }),
      mkField({
        field: 'date_of_birth',
        normalized_value: '12 May 1990',
        bbox: [0.05, 0.30, 0.40, 0.32],
        review_required: true,
      }),
    ]

    const packet = mkPacket({
      extracted_fields: fields,
      certification_record: mkCert(),
      controlling_spelling: { surname: 'SHEVCHENKO', given_name: 'TARAS' },
      qa_result: {
        status: 'REVIEW_REQUIRED',
        failures: [],
        warnings: ['date_of_birth flagged for review'],
        required_actions: ['confirm_date_of_birth'],
      },
    })

    const out = buildAdminAuditArtifact({
      packet,
      ticket: mkTicket(),
      events: [
        {
          event_type: 'ticket_created',
          metadata: { reason: 'missing_critical_fields' },
          created_at: '2026-05-09T01:00:00Z',
        },
        {
          event_type: 'state_transition',
          metadata: { from: 'queued', to: 'in_review' },
          created_at: '2026-05-09T01:05:00Z',
        },
      ],
      generatedAtIso: '2026-05-09T02:00:00Z',
      artifactId: 'audit_test_001',
    })

    expect(out.customer_visible).toBe(false)
    expect(out.contains_internal_trace).toBe(true)
    expect(out.artifact_id).toBe('audit_test_001')
    expect(out.session_id).toBe('sess-abc12345')
    expect(out.module.document_type).toBe('ua_internal_passport_booklet')
    expect(out.module.allowAutoPdf).toBe(true)
    expect(out.fields).toHaveLength(3)

    const seriesRow = out.fields.find(f => f.field_key === 'series')!
    expect(seriesRow.bbox).toEqual([0.05, 0.06, 0.10, 0.08])
    expect(seriesRow.ocr_ids).toEqual(['w_series_1'])
    expect(seriesRow.passes).toEqual(['visual_pass_1', 'visual_pass_2'])
    expect(seriesRow.validator_status).toBe('pass')

    const dobRow = out.fields.find(f => f.field_key === 'date_of_birth')!
    expect(dobRow.review_required).toBe(true)
    expect(dobRow.validator_status).toBe('review_required')

    expect(out.events).toHaveLength(2)
    expect(out.events[0].event_type).toBe('ticket_created')

    expect(out.ticket).toMatchObject({
      ticket_id: 't_42',
      reasons: ['missing_critical_fields'],
      priority: 'normal',
    })

    expect(out.certification.signed).toBe(true)
    expect(out.certification.version_current).toBe(true)
    expect(out.controlling_spelling).toEqual({ surname: 'SHEVCHENKO', given_name: 'TARAS' })
    expect(out.qa_result?.status).toBe('REVIEW_REQUIRED')
  })

  it('stamps validator_status="unknown" for fields with no normalized_value', () => {
    const out = buildAdminAuditArtifact({
      packet: mkPacket({
        extracted_fields: [
          mkField({ field: 'series', normalized_value: '', review_required: false }),
        ],
      }),
      ticket: null,
      events: [],
    })
    expect(out.fields[0].validator_status).toBe('unknown')
  })

  it('handles missing ticket and missing certification gracefully', () => {
    const out = buildAdminAuditArtifact({
      packet: mkPacket({ extracted_fields: [] }),
      ticket: null,
      events: [],
    })
    expect(out.ticket).toBeNull()
    expect(out.certification.signed).toBe(false)
    expect(out.certification.version_current).toBeNull()
  })

  it('does not mutate input packet or events', () => {
    const fields: ExtractedField[] = [mkField({ field: 'series' })]
    const packet = mkPacket({ extracted_fields: fields })
    const events = [
      { event_type: 'x', metadata: { a: 1 }, created_at: '2026-05-09T00:00:00Z' },
    ]
    const out = buildAdminAuditArtifact({ packet, ticket: null, events })
    // Mutate output and verify input is unaffected.
    out.fields[0].raw_value = 'changed'
    out.events[0].metadata.a = 2
    expect(packet.extracted_fields[0].raw_value).not.toBe('changed')
    expect((events[0].metadata as any).a).toBe(1)
  })

  it('artifact_id is deterministic based on session prefix + iso timestamp when not provided', () => {
    const out = buildAdminAuditArtifact({
      packet: mkPacket(),
      ticket: null,
      events: [],
      generatedAtIso: '2026-05-09T02:00:00Z',
    })
    expect(out.artifact_id).toMatch(/^audit_sess-abc_\d+$/)
  })
})
