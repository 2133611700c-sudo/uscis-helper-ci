/**
 * POST /api/translation/email-capture
 * Saves lead email before download and sends welcome email with tips.
 * Non-blocking — never fails the download flow.
 */
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

// Lazy init — do NOT call new Resend() at module level (crashes Next.js build when key absent)
function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not configured')
  return new Resend(key)
}
const FROM = (process.env.EMAIL_FROM_ADDRESS ?? 'noreply@messenginfo.com').trim()
const ADMIN = (process.env.BACKUP_EMAIL ?? 'info@messenginfo.com').trim()

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string
      locale?: string
      doc_type?: string
      src_lang?: string
    }

    const email = body.email?.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: 'invalid email' }, { status: 400 })
    }

    const locale = body.locale ?? 'en'
    const docType = body.doc_type ?? 'document'

    const subjects: Record<string, string> = {
      en: '✅ Your translation files are ready — Messenginfo',
      uk: '✅ Ваші файли перекладу готові — Messenginfo',
      ru: '✅ Ваши файлы перевода готовы — Messenginfo',
      es: '✅ Sus archivos de traducción están listos — Messenginfo',
    }

    const tips: Record<string, string[]> = {
      en: [
        'Print the <strong>Translation Draft</strong> file — this is what you submit to USCIS.',
        'Sign the certification statement by hand in the blue signature box.',
        'Keep a copy for your records.',
        'Submit with your USCIS application package.',
      ],
      uk: [
        'Роздрукуйте файл <strong>Чернетки перекладу</strong> — саме його ви подаєте до USCIS.',
        'Підпишіть заяву про підтвердження від руки в синьому полі підпису.',
        'Зберіть копію для своїх записів.',
        'Подайте разом з вашим пакетом документів до USCIS.',
      ],
      ru: [
        'Распечатайте файл <strong>Черновика перевода</strong> — именно его вы подаёте в USCIS.',
        'Подпишите заявление о подтверждении от руки в синем поле подписи.',
        'Сохраните копию для своих записей.',
        'Подайте вместе с вашим пакетом документов в USCIS.',
      ],
      es: [
        'Imprima el archivo <strong>Borrador de traducción</strong> — este es el que envía a USCIS.',
        'Firme la declaración de certificación a mano en el cuadro azul de firma.',
        'Guarde una copia para sus registros.',
        'Presente junto con su paquete de solicitud de USCIS.',
      ],
    }

    const tipLines = (tips[locale] ?? tips.en)
      .map((t, i) => `<li style="margin-bottom:8px">${i + 1}. ${t}</li>`)
      .join('')

    const html = `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <tr><td style="background:#2563eb;padding:24px 32px">
          <p style="margin:0;color:#fff;font-size:22px;font-weight:700">Messenginfo</p>
          <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px">Immigration Self-Help Tools</p>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="font-size:18px;font-weight:700;color:#1e293b;margin:0 0 16px">
            ${locale === 'uk' ? '✅ Ваші файли завантажуються!' : locale === 'ru' ? '✅ Ваши файлы загружаются!' : locale === 'es' ? '✅ ¡Sus archivos se están descargando!' : '✅ Your files are downloading!'}
          </p>
          <p style="font-size:14px;color:#475569;margin:0 0 24px">
            ${locale === 'uk' ? 'Ось що робити далі:' : locale === 'ru' ? 'Вот что делать дальше:' : locale === 'es' ? 'Aquí le decimos qué hacer a continuación:' : 'Here is what to do next:'}
          </p>
          <ul style="font-size:14px;color:#334155;padding-left:0;list-style:none;margin:0 0 24px">${tipLines}</ul>
          <a href="https://messenginfo.com/${locale}/services/translate-document"
            style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">
            ${locale === 'uk' ? 'Перекласти ще документ' : locale === 'ru' ? 'Перевести ещё документ' : locale === 'es' ? 'Traducir otro documento' : 'Translate another document'}
          </a>
          <p style="font-size:12px;color:#94a3b8;margin:24px 0 0">
            Messenginfo · Not a law firm · Information only<br>
            <a href="https://messenginfo.com/en/unsubscribe" style="color:#94a3b8">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

    // Send to user (non-blocking, catch silently)
    const resend = getResend()
    await resend.emails.send({
      from: `Messenginfo <${FROM}>`,
      to: email,
      subject: subjects[locale] ?? subjects.en,
      html,
    }).catch((e) => console.error('[email-capture] resend user error:', e))

    // Notify admin of new lead
    await resend.emails.send({
      from: `Messenginfo Leads <${FROM}>`,
      to: ADMIN,
      subject: `[Lead] New email capture: ${email} (${locale}, ${docType})`,
      html: `<p>New lead: <strong>${email}</strong><br>Locale: ${locale}<br>Doc type: ${docType}<br>Date: ${new Date().toISOString()}</p>`,
    }).catch((e) => console.error('[email-capture] resend admin error:', e))

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[email-capture] error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
