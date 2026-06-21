/**
 * pdf-lib packet input/output types — Messenginfo v5.0
 * Backward-compatible with existing index.ts / docx.ts / zip.ts
 */
import type { ExtractedField, SourceTrace, CertificationRecord, DocumentType } from '@/lib/translation/types'

export interface PacketInput {
  // v5 fields
  scopeTitle: string
  documentType: DocumentType | string
  fields: ExtractedField[]
  sourceTraces: SourceTrace[]
  certificationRecord: CertificationRecord
  sessionId: string
  qaWarnings?: string[]
  /** Drawn signature as a PNG data URL — embedded as an image in the cert block. */
  signatureDataUrl?: string | null

  // Legacy fields (used by index.ts / docx.ts)
  order_id?: string
  orderId?: string
  doc_type?: string
  source_language?: string
  target_language?: string
  translated_at?: string
  certifier_statement?: string
}

export interface DocumentFile {
  filename: string
  contentType: string
  buffer: Buffer
}

export interface PacketOutput {
  ok: boolean
  orderId?: string
  files: DocumentFile[]
  signedUrl?: string
  expiresAt?: Date
  error?: string
}
