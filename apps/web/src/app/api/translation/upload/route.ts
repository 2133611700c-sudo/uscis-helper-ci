/**
 * POST /api/translation/upload
 *
 * Accepts a document image (JPEG/PNG/WEBP, ≤10 MB).
 * Validates file type + size, stores to Supabase Storage,
 * persists translation_documents row, logs to audit_logs,
 * returns storage_key + document_id.
 *
 * Required body: multipart/form-data
 *   file         — the image file
 *   session_id   — existing translation_sessions.session_id
 *
 * Returns: { ok: true, document_id, storage_key, validation }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024          // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
const ALLOWED_EXTS  = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.pdf']
const STORAGE_BUCKET = 'translation-documents'

interface ValidationResult {
  valid: boolean
  errors: string[]
}

function validateFile(file: File): ValidationResult {
  const errors: string[] = []

  if (!ALLOWED_TYPES.includes(file.type)) {
    errors.push(`Unsupported MIME type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}`)
  }

  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
  if (!ALLOWED_EXTS.includes(ext)) {
    errors.push(`Unsupported extension: ${ext}`)
  }

  if (file.size > MAX_BYTES) {
    errors.push(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum: 10 MB`)
  }

  if (file.size === 0) {
    errors.push('File is empty')
  }

  return { valid: errors.length === 0, errors }
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()

  // Parse multipart form
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid multipart form data' }, { status: 400 })
  }

  const file = formData.get('file')
  const sessionId = formData.get('session_id')?.toString()

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'Field "file" is required' }, { status: 400 })
  }
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'Field "session_id" is required' }, { status: 400 })
  }

  // Verify session exists
  const { data: session, error: sessionErr } = await supabase
    .from('translation_sessions')
    .select('session_id, status')
    .eq('session_id', sessionId)
    .single()

  if (sessionErr || !session) {
    return NextResponse.json({ ok: false, error: `Session not found: ${sessionId}` }, { status: 404 })
  }

  // Validate file
  const validation = validateFile(file)
  if (!validation.valid) {
    return NextResponse.json({
      ok: false,
      error: 'File validation failed',
      validation,
    }, { status: 422 })
  }

  // HEIC/HEIF (iPhone default) → JPEG before storage, so everything downstream
  // (extraction, certifier preview, re-renders) reads a universally-decodable
  // format. Fail-open: an undecodable file is stored as-is with its real mime.
  let storedBuffer: Buffer = Buffer.from(await file.arrayBuffer())
  let storedType = file.type
  let storedName = file.name
  {
    const { heicToJpeg } = await import('@/lib/ocr/heicToJpeg')
    const conv = await heicToJpeg(storedBuffer, file.type)
    if (conv.converted) {
      storedBuffer = conv.buffer
      storedType = 'image/jpeg'
      storedName = file.name.replace(/\.(heic|heif)$/i, '') + '.jpg'
    }
  }

  // Build storage path
  const ext = '.' + (storedName.split('.').pop() ?? 'jpg').toLowerCase()
  const storageKey = `${sessionId}/${Date.now()}${ext}`

  // Upload to Supabase Storage
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storageKey, storedBuffer, {
      contentType: storedType,
      upsert: false,
    })

  if (uploadErr) {
    // Log failure
    await supabase.from('audit_logs').insert({
      session_id: sessionId,
      event_type: 'error',
      metadata: { step: 'upload', error: uploadErr.message, filename: file.name },
    })
    return NextResponse.json({
      ok: false,
      error: `Storage upload failed: ${uploadErr.message}`,
    }, { status: 500 })
  }

  // Persist document row
  const { data: doc, error: docErr } = await supabase
    .from('translation_documents')
    .insert({
      session_id: sessionId,
      storage_key: storageKey,
      original_name: file.name,
      mime_type: storedType,
      file_size_bytes: storedBuffer.length,
      upload_validated: true,
      validation_errors: [],
    })
    .select('id, session_id, storage_key, original_name, mime_type, file_size_bytes')
    .single()

  if (docErr || !doc) {
    return NextResponse.json({ ok: false, error: `DB insert failed: ${docErr?.message}` }, { status: 500 })
  }

  // Update session status → uploaded
  await supabase
    .from('translation_sessions')
    .update({ status: 'uploaded', uploaded_pages: 1, updated_at: new Date().toISOString() })
    .eq('session_id', sessionId)

  // Audit log
  await supabase.from('audit_logs').insert({
    session_id: sessionId,
    event_type: 'document_uploaded',
    metadata: {
      document_id: doc.id,
      storage_key: storageKey,
      original_name: file.name,
      file_size_bytes: storedBuffer.length,
      mime_type: storedType,
    },
  })

  return NextResponse.json({
    ok: true,
    document_id: doc.id,
    storage_key: storageKey,
    session_id: sessionId,
    validation,
    file: {
      name: storedName,
      size: storedBuffer.length,
      type: storedType,
    },
  })
}
