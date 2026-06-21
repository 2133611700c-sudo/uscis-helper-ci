/**
 * apps/web/src/lib/packet/index.ts
 *
 * Orchestrator for full document packet generation.
 * Generates PDF + DOCX, zips them, uploads to Supabase Storage,
 * and returns a signed download URL.
 */

import { generateTranslationPDF } from './pdf'
import { generateDraftDOCX } from './docx'
import { createPacketZIP } from './zip'
import type { PacketInput, PacketOutput, DocumentFile } from './types'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

const PACKETS_BUCKET = 'packets'
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60 // 7 days

/**
 * Generate a complete document packet:
 *   1. PDF translation certificate
 *   2. DOCX editable draft
 *   3. ZIP containing both + README
 *   4. Upload ZIP to Supabase Storage at packets/{order_id}/packet.zip
 *   5. Return signed URL (7-day expiry)
 *
 * Errors are caught and returned in PacketOutput.error — never throws.
 */
export async function generateFullPacket(input: PacketInput): Promise<PacketOutput> {
  const files: DocumentFile[] = []

  try {
    // 1. Generate PDF
    const pdfBuffer = await generateTranslationPDF(input)
    files.push({
      filename: `translation_${input.orderId ?? input.order_id ?? input.sessionId ?? 'N/A'}.pdf`,
      contentType: 'application/pdf',
      buffer: pdfBuffer,
    })

    // 2. Generate DOCX
    const docxBuffer = await generateDraftDOCX(input)
    files.push({
      filename: `translation_${input.orderId ?? input.order_id ?? input.sessionId ?? 'N/A'}.docx`,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docxBuffer,
    })

    // 3. Create ZIP
    const zipBuffer = await createPacketZIP(files)
    const zipFile: DocumentFile = {
      filename: `packet_${input.orderId ?? input.order_id ?? input.sessionId ?? 'N/A'}.zip`,
      contentType: 'application/zip',
      buffer: zipBuffer,
    }

    // 4. Upload to Supabase Storage
    const storageKey = `${input.orderId ?? input.order_id ?? input.sessionId ?? 'N/A'}/packet.zip`
    let signedUrl: string | undefined
    let expiresAt: Date | undefined

    try {
      const supabase = createAdminSupabaseClient()

      // Ensure bucket exists (will fail silently if already exists)
      await supabase.storage.createBucket(PACKETS_BUCKET, {
        public: false,
        fileSizeLimit: 50 * 1024 * 1024, // 50MB
      })

      const { error: uploadError } = await supabase.storage
        .from(PACKETS_BUCKET)
        .upload(storageKey, zipFile.buffer, {
          contentType: 'application/zip',
          upsert: true,
        })

      if (uploadError) {
        console.error('[packet] storage upload error:', uploadError.message)
      } else {
        const { data: signedData, error: signError } = await supabase.storage
          .from(PACKETS_BUCKET)
          .createSignedUrl(storageKey, SIGNED_URL_EXPIRY_SECONDS)

        if (!signError && signedData?.signedUrl) {
          signedUrl = signedData.signedUrl
          expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000)

          // Update translation_orders with pdf_storage_key and storage_key
          await supabase
            .from('translation_orders')
            .update({
              storage_key: storageKey,
              pdf_storage_key: `${input.orderId ?? input.order_id ?? input.sessionId ?? 'N/A'}/translation_${input.orderId ?? input.order_id ?? input.sessionId ?? 'N/A'}.pdf`,
              updated_at: new Date().toISOString(),
            })
            .eq('order_id', input.orderId ?? input.order_id ?? input.sessionId ?? 'N/A')
        }
      }
    } catch (storageErr: unknown) {
      const msg = storageErr instanceof Error ? storageErr.message : String(storageErr)
      console.error('[packet] storage layer error:', msg)
      // Continue — return files even if storage fails
    }

    return {
      ok: true,
      orderId: input.orderId ?? input.order_id ?? input.sessionId ?? 'N/A',
      files: [...files, zipFile],
      signedUrl,
      expiresAt,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[packet] generation error:', msg)
    return {
      ok: false,
      orderId: input.orderId ?? input.order_id ?? input.sessionId ?? 'N/A',
      files,
      error: `Packet generation failed: ${msg}`,
    }
  }
}

export { generateTranslationPDF } from './pdf'
export { generateDraftDOCX } from './docx'
export { createPacketZIP } from './zip'
export type { PacketInput, PacketOutput, DocumentFile } from './types'
