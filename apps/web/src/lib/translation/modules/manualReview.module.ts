/**
 * Manual Review Module — Messenginfo v6.0
 *
 * Fallback module for unknown, unsupported, low-confidence, or complex documents.
 * This module NEVER allows auto-PDF generation.
 *
 * Any document type not found in the registry is routed here.
 * Any active module that fails confidence checks is also routed here.
 */
import type { DocumentModule } from './types'

export const manualReviewModule: DocumentModule = {
  documentType: 'manual_review_required',

  displayName: {
    en: 'Document Requiring Manual Review',
    ru: 'Документ на ручной проверке',
    uk: 'Документ на ручній перевірці',
  },

  status: 'manual_only',

  supportedLanguages: ['uk', 'ru', 'en'],

  criticalFields: [],   // No auto-extraction — operator handles manually
  optionalFields: [],

  expectedLabels: {},
  glossaryModules: [],
  validators: [],

  extraction: {
    ocrProvider: 'manual',
    fieldMapper: 'manual',
    glossaryFiles: [],
    fieldTargets: [],
    timeoutMs: 0,
  },

  render: {
    templateId: 'manual_review',
    renderFields: [],
    certificationTemplate: 'none',
    twoPageLayout: false,
  },

  reviewPolicy: {
    requireUserConfirmation: true,
    requireEvidenceForCriticalFields: false,   // operator provides evidence manually
    allowAutoPdf: false,                        // NEVER auto-generate PDF
    manualReviewIfMissingCritical: true,
    manualReviewIfLowConfidence: true,
    manualReviewIfUnsupportedLayout: true,
    lowConfidenceThreshold: 1.0,               // always manual regardless of confidence
  },

  unsupportedConditions: [
    {
      code: 'unknown_document_type',
      description: 'Document type could not be identified',
      action: 'route_to_manual_review',
    },
    {
      code: 'low_classification_confidence',
      description: 'Document type classification confidence below threshold',
      action: 'route_to_manual_review',
    },
    {
      code: 'unsupported_layout',
      description: 'Document layout does not match any supported template',
      action: 'route_to_manual_review',
    },
    {
      code: 'missing_critical_fields',
      description: 'Too many critical fields could not be extracted',
      action: 'route_to_manual_review',
    },
    {
      code: 'image_quality_failed',
      description: 'Image quality insufficient for reliable extraction',
      action: 'route_to_manual_review',
    },
    {
      code: 'complex_table_document',
      description: 'Document contains complex tables not yet supported',
      action: 'route_to_manual_review',
    },
    {
      code: 'long_legal_text',
      description: 'Document contains long legal prose (not a standard form)',
      action: 'route_to_manual_review',
    },
    {
      code: 'handwriting_heavy',
      description: 'Document contains significant handwritten content',
      action: 'route_to_manual_review',
    },
    {
      code: 'unclear_seal_or_stamp',
      description: 'Issuing seal or stamp is illegible',
      action: 'route_to_manual_review',
    },
  ],

  /**
   * Safe user-facing message. Must not mention OCR, bounding boxes, or source traces.
   */
  userStatusMessage:
    'This document needs manual review. We can help prepare it, but it cannot be automatically finalized yet.',
}
