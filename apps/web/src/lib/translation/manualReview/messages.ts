/**
 * Manual review user-facing copy.
 *
 * 3 languages: en / ru / uk.
 * Key contract for non-developers reviewing this file:
 *   - No "AI failed", "OCR error", "unsupported error" wording.
 *   - No legal advice, no USCIS-acceptance claims, no guarantees.
 *   - No technical terms (OCR, bbox, source trace, validator).
 *   - Always offers a clear next action.
 *   - Always factual and calm.
 *
 * Used by:
 *   - GET /api/translation/[sessionId]/manual-review-status (response messageKey)
 *   - Translation wizard fallback UI
 *   - Email notifications to users (if enabled)
 */

export type SupportedLocale = 'en' | 'ru' | 'uk'

export const MANUAL_REVIEW_MESSAGES: Readonly<Record<string, Record<SupportedLocale, string>>> = {
  // ── Core fallback copy (matches mission spec) ───────────────────────────
  'mr.user.not_in_review': {
    en: 'No manual review is needed at this time.',
    ru: 'Ручная проверка не требуется.',
    uk: 'Ручна перевірка не потрібна.',
  },
  'mr.user.in_progress': {
    en: 'This document needs manual review. We can help prepare it, but it cannot be automatically finalized yet. We will notify you when it is ready for review.',
    ru: 'Этот документ требует ручной проверки. Мы можем помочь подготовить перевод, но пока не можем автоматически сформировать финальный документ. Мы сообщим вам, когда он будет готов к проверке.',
    uk: 'Цей документ потребує ручної перевірки. Ми можемо допомогти підготувати переклад, але поки не можемо автоматично сформувати фінальний документ. Ми повідомимо вас, коли він буде готовий до перевірки.',
  },
  'mr.user.awaiting_you': {
    en: 'We need a small bit of additional information from you to finish this translation. Please check your email for our message.',
    ru: 'Нам нужна небольшая дополнительная информация от вас, чтобы завершить этот перевод. Пожалуйста, проверьте свою электронную почту.',
    uk: 'Нам потрібна невелика додаткова інформація від вас, щоб завершити цей переклад. Будь ласка, перевірте свою електронну пошту.',
  },
  'mr.user.ready': {
    en: 'Your document has been reviewed and is ready. Please open it to confirm the translation.',
    ru: 'Ваш документ проверен и готов. Пожалуйста, откройте его, чтобы подтвердить перевод.',
    uk: 'Ваш документ перевірено і він готовий. Будь ласка, відкрийте його, щоб підтвердити переклад.',
  },
  'mr.user.closed': {
    en: 'This case is closed. If you have questions, contact us at contact@messenginfo.com.',
    ru: 'Дело закрыто. Если у вас есть вопросы, напишите на contact@messenginfo.com.',
    uk: 'Справу закрито. Якщо у вас є запитання, напишіть на contact@messenginfo.com.',
  },

  // ── Next-step hints ──────────────────────────────────────────────────────
  'mr.user.next.wait': {
    en: 'No action needed from you right now.',
    ru: 'Сейчас от вас ничего не требуется.',
    uk: 'Зараз від вас нічого не потрібно.',
  },
  'mr.user.next.check_email': {
    en: 'Please check your email for our message.',
    ru: 'Пожалуйста, проверьте электронную почту.',
    uk: 'Будь ласка, перевірте електронну пошту.',
  },
  'mr.user.next.review_translation': {
    en: 'Open the translation to confirm or request changes.',
    ru: 'Откройте перевод, чтобы подтвердить или запросить изменения.',
    uk: 'Відкрийте переклад, щоб підтвердити або запросити зміни.',
  },

  // ── Reason-specific (used by wizard inline messaging) ────────────────────
  'mr.image_quality_failed': {
    en: 'We need a clearer photo of this document. Please retake the photo with good lighting and the full document visible.',
    ru: 'Нам нужна более чёткая фотография документа. Пожалуйста, переснимите при хорошем освещении и так, чтобы весь документ был виден.',
    uk: 'Нам потрібна чіткіша фотографія документа. Будь ласка, перезніміть при хорошому освітленні так, щоб увесь документ був видимим.',
  },
  'mr.unknown_document_type': {
    en: 'We could not automatically identify this document. A team member will review it.',
    ru: 'Нам не удалось автоматически определить этот документ. Сотрудник проверит его вручную.',
    uk: 'Нам не вдалося автоматично визначити цей документ. Співробітник перевірить його вручну.',
  },
  'mr.unsupported_document_type': {
    en: 'This document type is not yet automatically supported. A team member will help you with it.',
    ru: 'Этот тип документа пока не поддерживается автоматически. Сотрудник поможет вам с ним.',
    uk: 'Цей тип документа поки не підтримується автоматично. Співробітник допоможе вам із ним.',
  },
  'mr.long_legal_text': {
    en: 'This document contains long text that needs careful review. A team member will handle it.',
    ru: 'В документе есть длинный текст, требующий внимательной проверки. С ним поможет сотрудник.',
    uk: 'У документі є довгий текст, який потребує уважної перевірки. З ним допоможе співробітник.',
  },
  'mr.complex_table_document': {
    en: 'This document has tables that need careful review. A team member will handle it.',
    ru: 'В документе есть таблицы, требующие внимательной проверки. С ним поможет сотрудник.',
    uk: 'У документі є таблиці, які потребують уважної перевірки. З ним допоможе співробітник.',
  },
  'mr.unclear_handwriting': {
    en: 'Some handwritten text needs careful reading. A team member will review it.',
    ru: 'Часть рукописного текста требует внимательного чтения. Сотрудник его проверит.',
    uk: 'Частина рукописного тексту потребує уважного прочитання. Співробітник перевірить його.',
  },
  'mr.unclear_seal_or_stamp': {
    en: 'A seal or stamp is hard to read. A team member will verify it.',
    ru: 'Печать или штамп трудночитаемы. Сотрудник проверит.',
    uk: 'Печатку або штамп важко прочитати. Співробітник перевірить.',
  },
  'mr.legal_or_court_document': {
    en: 'Court and legal documents need a team member’s review. We will help you.',
    ru: 'Судебные и юридические документы проверяет сотрудник. Мы вам поможем.',
    uk: 'Судові та юридичні документи перевіряє співробітник. Ми вам допоможемо.',
  },
  'mr.military_document': {
    en: 'Military documents need a team member’s review. We will help you.',
    ru: 'Военные документы проверяет сотрудник. Мы вам поможем.',
    uk: 'Військові документи перевіряє співробітник. Ми вам допоможемо.',
  },
  'mr.diploma_or_transcript': {
    en: 'Diplomas and transcripts need a team member’s review. We will help you.',
    ru: 'Дипломы и приложения к ним проверяет сотрудник. Мы вам поможем.',
    uk: 'Дипломи й додатки до них перевіряє співробітник. Ми вам допоможемо.',
  },
  'mr.identity_conflict': {
    en: 'We found differences between this document and your other documents. A team member will check this together with you.',
    ru: 'Мы нашли расхождения между этим документом и вашими другими документами. Сотрудник разберётся вместе с вами.',
    uk: 'Ми знайшли розбіжності між цим документом і вашими іншими документами. Співробітник розбереться разом із вами.',
  },
  'mr.glossary_unresolved': {
    en: 'A name or abbreviation needs verification. A team member will confirm the correct translation.',
    ru: 'Название или сокращение нужно проверить. Сотрудник подтвердит правильный перевод.',
    uk: 'Назву чи скорочення треба перевірити. Співробітник підтвердить правильний переклад.',
  },
  'mr.low_classification_confidence': {
    en: 'A team member will review this document.',
    ru: 'Этот документ проверит сотрудник.',
    uk: 'Цей документ перевірить співробітник.',
  },
  'mr.low_ocr_confidence': {
    en: 'A team member will review this document for accuracy.',
    ru: 'Сотрудник проверит этот документ на точность.',
    uk: 'Співробітник перевірить цей документ на точність.',
  },
  'mr.missing_critical_fields': {
    en: 'Some details could not be read clearly. A team member will help fill them in.',
    ru: 'Часть данных не удалось прочитать чётко. Сотрудник поможет их заполнить.',
    uk: 'Частину даних не вдалося прочитати чітко. Співробітник допоможе їх заповнити.',
  },
  'mr.missing_source_evidence': {
    en: 'A team member will verify each detail against the original document.',
    ru: 'Сотрудник сверит каждую деталь с оригиналом документа.',
    uk: 'Співробітник звірить кожну деталь з оригіналом документа.',
  },
  'mr.system_error': {
    en: 'Something on our side needs attention. A team member is looking into it.',
    ru: 'На нашей стороне есть момент, требующий внимания. Сотрудник этим занят.',
    uk: 'На нашому боці є момент, що потребує уваги. Співробітник цим займається.',
  },
  'mr.user_requested_human_help': {
    en: 'A team member will help you. Thank you for letting us know.',
    ru: 'Сотрудник вам поможет. Спасибо, что сообщили.',
    uk: 'Співробітник вам допоможе. Дякуємо, що повідомили.',
  },
  'mr.not_required': {
    en: 'No manual review is needed at this time.',
    ru: 'Ручная проверка не требуется.',
    uk: 'Ручна перевірка не потрібна.',
  },
  'mr.generic_manual_review': {
    en: 'A team member will review this document.',
    ru: 'Этот документ проверит сотрудник.',
    uk: 'Цей документ перевірить співробітник.',
  },
}

/**
 * Resolve a message key to a localized string. Falls back to English then to
 * 'mr.generic_manual_review' if the key is unknown.
 */
export function resolveManualReviewMessage(
  key: string,
  locale: SupportedLocale = 'en',
): string {
  const entry = MANUAL_REVIEW_MESSAGES[key] ?? MANUAL_REVIEW_MESSAGES['mr.generic_manual_review']
  return entry[locale] ?? entry.en
}
