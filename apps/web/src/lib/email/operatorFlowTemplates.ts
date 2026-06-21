/**
 * operatorFlowTemplates — pure email-template builders for the operator flow.
 * No sending here; callers pass the result to the mailer.
 *
 * Locales: en / ru / uk (es falls back to en).
 * Content rules: no fixed prices, never «консультация», never
 * «сертифицированный перевод» — the operator-reviewed product is
 * «перевод, проверенный специалистом» / «переклад, перевірений спеціалістом».
 * No PII beyond what the caller passes (doc-type label + order URL).
 */

export type OperatorEmailLocale = string

export interface EmailContent {
  subject: string
  html: string
  text: string
}

interface ReceivedCopy {
  subject: (doc: string) => string
  greeting: string
  body: (doc: string) => string
  track: string
  footer: string
}

interface CompletedCopy {
  subject: (doc: string) => string
  greeting: string
  body: (doc: string) => string
  attached: string
  footer: string
}

const RECEIVED: Record<'en' | 'ru' | 'uk', ReceivedCopy> = {
  en: {
    subject: (doc) => `Order received — ${doc} translation`,
    greeting: 'Hello,',
    body: (doc) =>
      `We received your order for the translation of your ${doc}. Our specialist is preparing your translation now. The finished PDF will arrive in this inbox, usually within 24 hours.`,
    track: 'Track your order here:',
    footer: 'Messenginfo — SK Logistics LLC, Los Angeles, CA',
  },
  ru: {
    subject: (doc) => `Заказ получен — перевод: ${doc}`,
    greeting: 'Здравствуйте!',
    body: (doc) =>
      `Мы получили ваш заказ на перевод документа «${doc}». Наш специалист уже готовит перевод, проверенный специалистом. Готовый PDF придёт на эту почту, обычно в течение 24 часов.`,
    track: 'Следить за заказом можно здесь:',
    footer: 'Messenginfo — SK Logistics LLC, Los Angeles, CA',
  },
  uk: {
    subject: (doc) => `Замовлення отримано — переклад: ${doc}`,
    greeting: 'Вітаємо!',
    body: (doc) =>
      `Ми отримали ваше замовлення на переклад документа «${doc}». Наш спеціаліст уже готує переклад, перевірений спеціалістом. Готовий PDF надійде на цю пошту, зазвичай протягом 24 годин.`,
    track: 'Стежити за замовленням можна тут:',
    footer: 'Messenginfo — SK Logistics LLC, Los Angeles, CA',
  },
}

const COMPLETED: Record<'en' | 'ru' | 'uk', CompletedCopy> = {
  en: {
    subject: (doc) => `Your translation is ready — ${doc}`,
    greeting: 'Hello,',
    body: (doc) =>
      `Your translation of the ${doc} is ready. Our specialist has reviewed it.`,
    attached: 'The PDF is attached to this email.',
    footer: 'Messenginfo — SK Logistics LLC, Los Angeles, CA',
  },
  ru: {
    subject: (doc) => `Ваш перевод готов — ${doc}`,
    greeting: 'Здравствуйте!',
    body: (doc) =>
      `Ваш перевод документа «${doc}» готов. Это перевод, проверенный специалистом.`,
    attached: 'Готовый PDF прикреплён к этому письму.',
    footer: 'Messenginfo — SK Logistics LLC, Los Angeles, CA',
  },
  uk: {
    subject: (doc) => `Ваш переклад готовий — ${doc}`,
    greeting: 'Вітаємо!',
    body: (doc) =>
      `Ваш переклад документа «${doc}» готовий. Це переклад, перевірений спеціалістом.`,
    attached: 'Готовий PDF прикріплено до цього листа.',
    footer: 'Messenginfo — SK Logistics LLC, Los Angeles, CA',
  },
}

function pickLocale(locale: OperatorEmailLocale): 'en' | 'ru' | 'uk' {
  return locale === 'ru' || locale === 'uk' ? locale : 'en'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Simple, table-free, inline-styled, mobile-friendly HTML wrapper (dark text on white). */
function wrapHtml(paragraphs: string[]): string {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1a1a1a;">${p}</p>`,
    )
    .join('\n')
  return [
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px;background:#ffffff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;">',
    body,
    '</div>',
  ].join('\n')
}

export function orderReceivedEmail({
  locale,
  orderUrl,
  docTypeLabel,
}: {
  locale: OperatorEmailLocale
  orderUrl: string
  docTypeLabel: string
}): EmailContent {
  const c = RECEIVED[pickLocale(locale)]
  const doc = docTypeLabel.trim()
  const subject = c.subject(doc)
  const safeUrl = escapeHtml(orderUrl)
  const html = wrapHtml([
    escapeHtml(c.greeting),
    escapeHtml(c.body(doc)),
    `${escapeHtml(c.track)} <a href="${safeUrl}" style="color:#1d4ed8;word-break:break-all;">${safeUrl}</a>`,
    `<span style="font-size:13px;color:#666666;">${escapeHtml(c.footer)}</span>`,
  ])
  const text = [c.greeting, '', c.body(doc), '', `${c.track} ${orderUrl}`, '', c.footer].join('\n')
  return { subject, html, text }
}

export function orderCompletedEmail({
  locale,
  docTypeLabel,
}: {
  locale: OperatorEmailLocale
  docTypeLabel: string
}): EmailContent {
  const c = COMPLETED[pickLocale(locale)]
  const doc = docTypeLabel.trim()
  const subject = c.subject(doc)
  const html = wrapHtml([
    escapeHtml(c.greeting),
    escapeHtml(c.body(doc)),
    `<strong>${escapeHtml(c.attached)}</strong>`,
    `<span style="font-size:13px;color:#666666;">${escapeHtml(c.footer)}</span>`,
  ])
  const text = [c.greeting, '', c.body(doc), '', c.attached, '', c.footer].join('\n')
  return { subject, html, text }
}
