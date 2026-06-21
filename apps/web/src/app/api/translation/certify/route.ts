/**
 * POST /api/translation/certify
 * Records the human signer's certification record.
 * Validates completeness before allowing render.
 */
import { NextRequest, NextResponse } from 'next/server'
import { buildCertificationRecord, validateCertificationRecord } from '@/lib/translation/certificationRecord'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { getCriticalFieldsForDocumentType } from '@/lib/translation/modules/adapters'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = getClientIP(req)
  const rl = await rateLimit(`translation_certify:${ip}`, 10, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })

  const body = await req.json().catch(() => ({})) as {
    session_id?: string
    signer_name?: string
    signer_address?: string
    signer_phone?: string
    signer_email?: string
    source_language?: string
    signature_typed_name?: string
  }

  const { session_id, signer_name, signature_typed_name, source_language } = body

  if (!session_id) return NextResponse.json({ ok: false, error: 'session_id required' }, { status: 400 })
  if (!signer_name) return NextResponse.json({ ok: false, error: 'signer_name required' }, { status: 400 })
  if (!signature_typed_name) return NextResponse.json({ ok: false, error: 'signature_typed_name required' }, { status: 400 })

  // ── Gate: all critical fields must be confirmed before certification ────────
  const supabaseGate = createAdminSupabaseClient()

  // Fetch doc_type from session so the critical field list is module-driven
  const { data: sessionRow } = await supabaseGate
    .from('translation_sessions')
    .select('doc_type')
    .eq('session_id', session_id)
    .single()

  const docType = sessionRow?.doc_type ?? null
  const CRITICAL_FIELDS = getCriticalFieldsForDocumentType(docType)

  const { data: fieldRows } = await supabaseGate
    .from('extracted_fields')
    .select('field, confirmed')
    .eq('session_id', session_id)

  const fields = fieldRows ?? []
  const presentCritical = CRITICAL_FIELDS.filter(cf => fields.find(f => f.field === cf))
  const unconfirmedCritical = presentCritical.filter(cf => {
    const row = fields.find(f => f.field === cf)
    return row && !row.confirmed
  })

  if (unconfirmedCritical.length > 0) {
    return NextResponse.json({
      ok: false,
      error: 'Cannot certify: critical fields not yet confirmed by human reviewer.',
      gate: 'critical_fields_unconfirmed',
      unconfirmed_critical: unconfirmedCritical,
      required_action: `Please confirm all required fields in the Review tab before signing: ${unconfirmedCritical.join(', ')}`,
    }, { status: 400 })
  }

  const record = buildCertificationRecord({
    signerName: signer_name,
    signerAddress: body.signer_address,
    signerPhone: body.signer_phone,
    signerEmail: body.signer_email,
    sourceLanguage: source_language ?? 'Ukrainian',
    signatureTypedName: signature_typed_name,
  })

  const { valid, errors } = validateCertificationRecord(record)
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'Certification record invalid', details: errors }, { status: 400 })
  }

  // Persist certification record to dedicated table
  try {
    const supabase = supabaseGate

    // Upsert into certification_records
    await supabase.from('certification_records').upsert({
      session_id:             session_id,
      signer_full_name:       record.signer_full_name,
      signer_address:         body.signer_address ?? null,
      signer_phone:           body.signer_phone ?? null,
      signer_email:           body.signer_email ?? null,
      source_language:        body.source_language ?? 'Ukrainian',
      target_language:        'English',
      language_pair_confirmed: record.language_pair_confirmed,
      statement:              record.statement,
      signature_typed_name:   record.signature_typed_name,
      certification_version:  record.certification_version,
      signed_at:              record.signed_at,
    }, { onConflict: 'session_id' })

    // Update session status
    await supabase.from('translation_sessions')
      .update({ status: 'certified', updated_at: new Date().toISOString() })
      .eq('session_id', session_id)

    // Audit log — PII-safe: no raw names, only metadata
    await supabase.from('audit_logs').insert({
      session_id,
      event_type: 'certification_completed',
      metadata: {
        signer_name_length: record.signer_full_name?.length ?? 0,
        certification_version: record.certification_version,
        signed_at: record.signed_at,
        language_pair_confirmed: record.language_pair_confirmed,
      },
    })
  } catch (err) {
    console.error('[translation/certify] persist failed:', err)
  }

  return NextResponse.json({
    ok: true,
    session_id,
    certified_at: record.signed_at,
    certification_version: record.certification_version,
    message: 'Certification recorded. Payment required before final render.',
  })
}
