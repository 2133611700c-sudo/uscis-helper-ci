'use server'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { generateTranslationPDF } from '@/lib/packet/pdf'
import { buildCertificationRecord } from '@/lib/translation/certificationRecord'
import { sendEmail } from '@/lib/email/resend'
import { orderCompletedEmail } from '@/lib/email/operatorFlowTemplates'
import { writeManualReviewEvent } from '@/lib/translation/manualReview/createManualReviewTicket'
import type { ExtractedField } from '@/lib/translation/types'
import { requireTranslationOperator, resolveVerifiedRecipient } from './legacyOperatorAuth'
import { stripeTranslationVerifier } from './stripeRecipientVerifier'

const LANG_LABELS: Record<string, string> = {
  ru: 'Russian',
  uk: 'Ukrainian',
  'uk-soviet': 'Ukrainian (Soviet era)',
}

export async function sendTranslation(formData: FormData) {
  // SECURITY (0.5): authorize FIRST — before reading input or any side effect.
  const { actor } = await requireTranslationOperator()

  const id         = formData.get('id')         as string
  const docType    = formData.get('docType')    as string
  const sourceLang = formData.get('sourceLang') as string

  if (!id || !docType) {
    throw new Error('Missing required fields')
  }

  // Collect translated_fields from form (keys prefixed with "tf_")
  const translatedFields: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('tf_') && typeof value === 'string' && value.trim()) {
      translatedFields[key.slice(3)] = value.trim()
    }
  }

  if (Object.keys(translatedFields).length === 0) {
    throw new Error('No translated fields provided')
  }

  // SECURITY (0.5): recipient is RE-VERIFIED against Stripe at send time (the
  // ticket's contact_email has client writers, so it is not trusted). The
  // form-submitted address is IGNORED. Fail closed if there is no verified
  // paid translation session.
  const supabase = createAdminSupabaseClient()
  const { email: recipient } = await resolveVerifiedRecipient(supabase, id, stripeTranslationVerifier)
  if (!recipient) {
    throw new Error('recipient_not_verified')
  }

  const originalLanguage = LANG_LABELS[sourceLang] ?? 'Ukrainian'

  // 1. Send translation email to the VERIFIED client address
  const emailRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/translation/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email:       recipient,
      prodId:      docType,
      fieldValues: translatedFields,
      srcLang:     originalLanguage,
      docLabel:    docType.replace(/_/g, ' '),
    }),
  })

  if (!emailRes.ok) {
    const body = await emailRes.json().catch(() => ({}))
    throw new Error(`Email send failed: ${(body as { error?: string }).error ?? emailRes.status}`)
  }

  // 2. Update queue row: status=completed, reviewed_at=now(), store translated_fields
  const { error } = await supabase
    .from('manual_review_queue')
    .update({
      status:            'completed',
      reviewed_at:       new Date().toISOString(),
      reviewed_by:       actor,
      translated_fields: translatedFields,
    })
    .eq('id', id)

  if (error) {
    throw new Error(`Supabase update failed: ${error.message}`)
  }

  redirect('/admin/manual-review')
}

/**
 * approveAndSendPdf — operator approves edited fields, renders a REAL
 * certification PDF (generateTranslationPDF) and emails it to the client.
 *
 * Safety: requires OPERATOR_SIGNER_NAME — we NEVER silently send an
 * uncertified PDF. PII rule: never log field values or recipient emails.
 * SECURITY (0.5): operator-authorized first; recipient is server-authoritative.
 */
export async function approveAndSendPdf(
  formData: FormData,
): Promise<{ ok: false; error: string } | void> {
  // SECURITY (0.5): authorize FIRST — before reading input or any side effect.
  const { actor } = await requireTranslationOperator()

  const id         = formData.get('id')         as string
  const docType    = formData.get('docType')    as string
  const sourceLang = formData.get('sourceLang') as string

  if (!id || !docType) {
    throw new Error('Missing required fields')
  }

  // Collect edited translated fields from form (keys prefixed with "tf_")
  const translatedFields: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('tf_') && typeof value === 'string' && value.trim()) {
      translatedFields[key.slice(3)] = value.trim()
    }
  }

  if (Object.keys(translatedFields).length === 0) {
    throw new Error('No translated fields provided')
  }

  // Certification gate — never send an uncertified PDF silently.
  const signerName = process.env.OPERATOR_SIGNER_NAME ?? ''
  if (!signerName.trim()) {
    return { ok: false, error: 'operator_signer_not_configured' }
  }

  // SECURITY (0.5): recipient RE-VERIFIED against Stripe; form address IGNORED;
  // fail closed without a verified paid translation session.
  const supabase = createAdminSupabaseClient()
  const { email: recipient } = await resolveVerifiedRecipient(supabase, id, stripeTranslationVerifier)
  if (!recipient) {
    return { ok: false, error: 'recipient_not_verified' }
  }

  const certificationRecord = buildCertificationRecord({
    signerName,
    signerAddress: process.env.OPERATOR_SIGNER_ADDRESS ?? '',
    signerPhone: '',
    signerEmail: '',
    sourceLanguage: LANG_LABELS[sourceLang] ?? 'Ukrainian',
    signatureTypedName: signerName,
  })

  // Operator-edited values are the release values: raw == normalized == edited,
  // review_required=false (the operator IS the review).
  const fields: ExtractedField[] = Object.entries(translatedFields).map(([field, editedValue]) => ({
    field,
    source_label: field,
    source_zone: 'manual_review',
    bbox: [0, 0, 0, 0],
    raw_value: editedValue,
    normalized_value: editedValue,
    language_layer: 'unknown',
    confidence: 1,
    review_required: false,
  }))

  const docTypeLabel = docType.replace(/_/g, ' ')
  const pdf = await generateTranslationPDF({
    scopeTitle: `English Translation of ${docTypeLabel}`,
    documentType: docType,
    fields,
    sourceTraces: [],
    certificationRecord,
    sessionId: id,
  })

  const emailContent = orderCompletedEmail({ locale: 'en', docTypeLabel })

  const sendResult = await sendEmail({
    to: recipient,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    type: 'translation_email',
    attachment: {
      filename: 'translation.pdf',
      content: pdf.toString('base64'),
      encoding: 'base64',
    },
  })

  if (!sendResult.ok) {
    // PII rule: never include the recipient email or field values here.
    throw new Error(`Email send failed: ${sendResult.error ?? 'unknown'}`)
  }

  const { error } = await supabase
    .from('manual_review_queue')
    .update({
      status:            'completed',
      reviewed_at:       new Date().toISOString(),
      reviewed_by:       actor,
      translated_fields: translatedFields,
    })
    .eq('id', id)

  if (error) {
    throw new Error(`Supabase update failed: ${error.message}`)
  }

  await writeManualReviewEvent({
    ticket_id: id,
    session_id: null,
    event_type: 'operator_completed',
    metadata: {
      route: 'admin.approveAndSendPdf',
      status: 'completed',
      count: Object.keys(translatedFields).length,
    },
  })

  revalidatePath('/admin/manual-review')
  redirect('/admin/manual-review')
}

/**
 * Form adapter for approveAndSendPdf — React's formAction requires Promise<void>,
 * so a config error is surfaced by throwing (visible to the operator) instead of
 * being silently swallowed by the form.
 */
export async function approveAndSendPdfForm(formData: FormData): Promise<void> {
  const result = await approveAndSendPdf(formData)
  if (result && !result.ok) {
    throw new Error(result.error)
  }
}

export async function markInReview(id: string) {
  // SECURITY (0.5): authorize FIRST — before any mutation.
  await requireTranslationOperator()
  const supabase = createAdminSupabaseClient()
  await supabase
    .from('manual_review_queue')
    .update({ status: 'in_review' })
    .eq('id', id)
}
