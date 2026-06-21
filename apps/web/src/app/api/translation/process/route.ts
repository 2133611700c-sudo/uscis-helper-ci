import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateFullPacket } from '@/lib/packet'
import type { PacketInput } from '@/lib/packet'

function getSupabase() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

// GET /api/translation/process?order_id=ORD-xxx — get order status + fields
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('order_id')
  if (!orderId) return NextResponse.json({ error: 'order_id required' }, { status: 400 })

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('translation_orders')
      .select(
        'order_id, status, ocr_status, fields_extracted, fields_reviewed, pdf_storage_key, locale, document_type, created_at, updated_at'
      )
      .eq('order_id', orderId)
      .single()

    if (error || !data) return NextResponse.json({ error: 'order not found' }, { status: 404 })
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/translation/process — submit reviewed fields, advance status
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { order_id, fields_reviewed, status } = body

    if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 })

    const supabase = getSupabase()
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (fields_reviewed !== undefined) update.fields_reviewed = fields_reviewed
    if (status !== undefined) update.status = status

    const { data, error } = await supabase
      .from('translation_orders')
      .update(update)
      .eq('order_id', order_id)
      .select('order_id, status, ocr_status, updated_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Log event
    await supabase.from('translation_events').insert({
      order_id,
      event_type: 'fields_reviewed',
      metadata: { status: data.status },
    })

    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/translation/process — generate packet for a reviewed order
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { order_id?: string }
    const { order_id } = body

    if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 })

    const supabase = getSupabase()

    // Fetch order details
    const { data: order, error: fetchError } = await supabase
      .from('translation_orders')
      .select('order_id, status, document_type, locale, fields_reviewed')
      .eq('order_id', order_id)
      .single()

    if (fetchError ?? !order) {
      return NextResponse.json({ error: 'order not found' }, { status: 404 })
    }

    // Build PacketInput from order data
    // Map legacy field shape to v5 ExtractedField shape
    type LegacyField = { field_name: string; source_text: string; translated_text: string }
    const rawFields = Array.isArray(order.fields_reviewed)
      ? (order.fields_reviewed as LegacyField[])
      : []

    const fields = rawFields.map((f: LegacyField) => ({
      field: f.field_name ?? 'unknown',
      source_label: f.field_name ?? '',
      source_zone: 'unknown',
      bbox: [0, 0, 1, 1] as [number, number, number, number],
      raw_value: f.source_text ?? '',
      normalized_value: f.translated_text ?? '',
      language_layer: 'uk' as const,
      confidence: 1.0,
      review_required: false,
    }))

    const input: PacketInput = {
      order_id: order.order_id as string,
      scopeTitle: `English Translation of Ukrainian Document`,
      documentType: (order.document_type as string) ?? 'other',
      doc_type: (order.document_type as string) ?? 'other',
      source_language: 'Ukrainian',
      target_language: (order.locale as string) ?? 'en',
      translated_at: new Date().toISOString(),
      fields,
      sourceTraces: [],
      certificationRecord: {
        signer_full_name: '',
        language_pair_confirmed: false,
        statement: '',
        signature_typed_name: '',
        signed_at: new Date().toISOString(),
        certification_version: 'v1.0-8cfr-2026',
      },
      sessionId: order.order_id as string,
    }

    const result = await generateFullPacket(input)

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'Packet generation failed' }, { status: 500 })
    }

    // Update order status
    await supabase
      .from('translation_orders')
      .update({ status: 'packet_ready', updated_at: new Date().toISOString() })
      .eq('order_id', order_id)

    await supabase.from('translation_events').insert({
      order_id,
      event_type: 'packet_generated',
      metadata: {
        has_signed_url: !!result.signedUrl,
        files_count: result.files.length,
      },
    })

    return NextResponse.json({
      ok: true,
      order_id,
      download_url: result.signedUrl ?? null,
      expires_at: result.expiresAt?.toISOString() ?? null,
      files: result.files.map((f) => ({ filename: f.filename, contentType: f.contentType })),
    })
  } catch (e: unknown) {
    console.error('[translation/process] packet error:', String(e))
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
