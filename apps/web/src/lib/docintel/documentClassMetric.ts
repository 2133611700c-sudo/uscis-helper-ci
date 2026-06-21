/**
 * docintel/documentClassMetric — PII-FREE document-class counter.
 *
 * Purpose: learn the real `allowlist_traffic_share` (how much traffic is
 * handwritten-fabrication-risk) so self-consistency cost can be judged from data,
 * not guessed. See docs/reports/SELF_CONSISTENCY_DESIGN.md.
 *
 * Logging/metric ONLY — NO behavior change. Emits a single structured line via
 * console.info ONLY when DOCUMENT_CLASS_METRICS_ENABLED=1 (default OFF → silent).
 *
 * HARD rule: this records ONLY a document CLASS and eligibility booleans. It takes
 * NO identity fields, NO names, NO DOB, NO addresses, NO raw text, NO file names.
 * The function signature makes PII unrepresentable.
 */

import { docintelIdToDocumentClass } from '@/lib/canonical/core/documentClassPolicy'
import { HANDWRITTEN_FABRICATION_RISK_CLASSES } from './antiFabricationGate'

export type MetricProduct = 'tps' | 'translation' | 'reparole' | 'ead'

export interface DocumentClassMetric {
  kind: 'document_class_count'
  product: MetricProduct
  doc_type_id: string
  doc_class: string
  anti_fabrication_allowlist_eligible: boolean
  self_consistency_eligible: boolean
}

/** Build the PII-free metric record (pure; testable without emitting). */
export function buildDocumentClassMetric(input: {
  product: MetricProduct
  docTypeId: string
}): DocumentClassMetric {
  const docClass = docintelIdToDocumentClass(input.docTypeId)
  const eligible = HANDWRITTEN_FABRICATION_RISK_CLASSES.has(docClass)
  return {
    kind: 'document_class_count',
    product: input.product,
    doc_type_id: input.docTypeId,
    doc_class: docClass,
    anti_fabrication_allowlist_eligible: eligible,
    self_consistency_eligible: eligible, // same allowlist drives both today
  }
}

/**
 * Emit the metric. Safe if no metrics backend exists (just a structured log line).
 * Silent unless DOCUMENT_CLASS_METRICS_ENABLED=1. Never throws into the caller.
 */
export function recordDocumentClassMetric(input: {
  product: MetricProduct
  docTypeId: string
}): void {
  if (process.env.DOCUMENT_CLASS_METRICS_ENABLED !== '1') return
  try {
    const record = buildDocumentClassMetric(input)
    // eslint-disable-next-line no-console
    console.info('[document_class_metric]', JSON.stringify(record))
  } catch {
    // metric must never affect the request
  }
}
