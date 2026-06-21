/**
 * Mail-Ready Export Gate — blocks export when data is incomplete or conflicted.
 * 
 * This is the LAST safety layer before the user gets a PDF package.
 * If this gate says NO, the user sees a clear message and must resolve issues.
 * If this gate says YES, the package is safe to print, sign, and mail.
 *
 * The user is 30-80 years old, minimal tech experience.
 * They must NEVER receive a package that looks ready but has hidden problems.
 */

import type { TPSAnswers } from './answers'
import { checkTranslationCompleteness, type TPSDocumentType } from './translationBridge'
import { requiredFieldsWithLabels, recommendedFieldsWithLabels } from './readinessPolicy'

export interface GateResult {
  mail_ready: boolean
  blockers: GateBlocker[]
  warnings: GateWarning[]
}

export interface GateBlocker {
  field: string
  reason: string
  user_message: { en: string; ru: string; uk: string }
}

export interface GateWarning {
  field: string
  reason: string
  user_message: { en: string; ru: string; uk: string }
}

// Fields that MUST be filled for I-765 + I-821 mail filing — derived from the
// single readinessPolicy ('mail' stage). part7_reviewed is also mail-required
// in the policy but keeps its own dedicated blocker block below (custom i18n
// message), so it is excluded from this generic loop to avoid a duplicate.
const REQUIRED_FIELDS: Array<{ key: keyof TPSAnswers; label: string }> =
  requiredFieldsWithLabels('mail').filter((f) => f.key !== 'part7_reviewed')

// Fields that are important but not absolute blockers — from the same policy.
const RECOMMENDED_FIELDS: Array<{ key: keyof TPSAnswers; label: string }> =
  recommendedFieldsWithLabels('mail')

/**
 * Run the mail-ready gate. Call this BEFORE generating the final ZIP.
 * If mail_ready=false, show blockers to user and do not export.
 */
export function runMailReadyGate(
  answers: Partial<TPSAnswers>,
  conflicts?: Array<{ field: string; reason: string }>,
  lowConfidenceFields?: Array<{ field: string; confidence: number }>,
  translationCheck?: { uploadedDocTypes: TPSDocumentType[]; generatedTranslations: TPSDocumentType[] },
): GateResult {
  const blockers: GateBlocker[] = []
  const warnings: GateWarning[] = []

  // Check required fields
  for (const { key, label } of REQUIRED_FIELDS) {
    const val = answers[key]
    if (!val || (typeof val === 'string' && val.trim() === '')) {
      blockers.push({
        field: key,
        reason: `required_field_empty`,
        user_message: {
          en: `"${label}" is required but empty. Please fill it in.`,
          ru: `"${label}" — обязательное поле. Пожалуйста, заполните.`,
          uk: `"${label}" — обов'язкове поле. Будь ласка, заповніть.`,
        },
      })
    }
  }

  // P1 FIX (2026-05-24): Part 7 background declaration must be explicitly
  // reviewed. Without this, the user signs 30 "No" answers they never saw.
  if (!answers.part7_reviewed) {
    blockers.push({
      field: 'part7_reviewed',
      reason: 'part7_not_reviewed',
      user_message: {
        en: 'Please review and confirm the Part 7 background declaration before generating.',
        ru: 'Пожалуйста, проверьте и подтвердите декларацию Part 7 перед генерацией.',
        uk: 'Будь ласка, перевірте та підтвердіть декларацію Part 7 перед генерацією.',
      },
    })
  }

  // Check recommended fields (warnings, not blockers)
  for (const { key, label } of RECOMMENDED_FIELDS) {
    const val = answers[key]
    if (!val || (typeof val === 'string' && val.trim() === '')) {
      warnings.push({
        field: key,
        reason: `recommended_field_empty`,
        user_message: {
          en: `"${label}" is empty. USCIS may send a Request for Evidence (RFE).`,
          ru: `"${label}" не заполнено. USCIS может запросить дополнительные документы (RFE).`,
          uk: `"${label}" не заповнено. USCIS може запросити додаткові документи (RFE).`,
        },
      })
    }
  }

  // Check controlling spelling conflicts
  if (conflicts && conflicts.length > 0) {
    for (const c of conflicts) {
      blockers.push({
        field: c.field,
        reason: 'controlling_spelling_conflict',
        user_message: {
          en: `"${c.field}" has conflicting values in your documents. Please review and choose the correct one.`,
          ru: `"${c.field}" — в ваших документах разные значения. Проверьте и выберите правильное.`,
          uk: `"${c.field}" — у ваших документах різні значення. Перевірте і оберіть правильне.`,
        },
      })
    }
  }

  // Check low-confidence OCR fields
  if (lowConfidenceFields) {
    for (const lc of lowConfidenceFields) {
      if (lc.confidence < 0.5) {
        blockers.push({
          field: lc.field,
          reason: `ocr_confidence_too_low:${lc.confidence}`,
          user_message: {
            en: `"${lc.field}" was read from your document but the quality is too low. Please type it manually.`,
            ru: `"${lc.field}" прочитано из документа, но качество слишком низкое. Введите вручную.`,
            uk: `"${lc.field}" зчитано з документу, але якість занадто низька. Введіть вручну.`,
          },
        })
      } else if (lc.confidence < 0.7) {
        warnings.push({
          field: lc.field,
          reason: `ocr_confidence_low:${lc.confidence}`,
          user_message: {
            en: `"${lc.field}" was read from your document — please double-check it.`,
            ru: `"${lc.field}" прочитано из документа — пожалуйста, проверьте.`,
            uk: `"${lc.field}" зчитано з документу — будь ласка, перевірте.`,
          },
        })
      }
    }
  }

  // Validate phone format (10 digits)
  if (answers.daytime_phone) {
    const digits = answers.daytime_phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      blockers.push({
        field: 'daytime_phone',
        reason: 'invalid_phone_format',
        user_message: {
          en: 'Phone number must be 10 digits (US format).',
          ru: 'Номер телефона должен содержать 10 цифр (формат США).',
          uk: 'Номер телефону повинен містити 10 цифр (формат США).',
        },
      })
    }
  }

  // Validate email has @
  if (answers.email && !answers.email.includes('@')) {
    blockers.push({
      field: 'email',
      reason: 'invalid_email',
      user_message: {
        en: 'Please enter a valid email address.',
        ru: 'Пожалуйста, введите правильный email.',
        uk: 'Будь ласка, введіть правильну email адресу.',
      },
    })
  }

  // Translation completeness check (ADR-006)
  // If foreign-language documents were uploaded, translation MUST be generated.
  // 8 CFR §103.2(b)(3): any foreign-language document must have English translation.
  if (translationCheck) {
    const missingTranslations = checkTranslationCompleteness(
      translationCheck.uploadedDocTypes,
      translationCheck.generatedTranslations,
    )
    for (const msg of missingTranslations) {
      warnings.push({
        field: 'translation',
        reason: 'translation_missing',
        user_message: {
          en: `${msg}. USCIS requires English translation of foreign-language documents.`,
          ru: `${msg}. USCIS требует перевод иностранных документов на английский.`,
          uk: `${msg}. USCIS вимагає переклад іноземних документів на англійську.`,
        },
      })
    }
  }

  return {
    mail_ready: blockers.length === 0,
    blockers,
    warnings,
  }
}
