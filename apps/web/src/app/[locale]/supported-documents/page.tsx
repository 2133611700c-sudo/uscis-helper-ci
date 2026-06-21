/**
 * /supported-documents — the user-facing inventory of every document class the
 * platform supports (Phase 6, 2026-06-11). REGISTRY-DRIVEN: the field lists and
 * handwritten flags are read from the docintel registry at build time — never a
 * hardcoded copy that can drift. Wizard availability + mirror coverage mirror
 * docs/architecture/DOC_COVERAGE_MATRIX.md.
 */
import type { Metadata } from 'next'
import { routing } from '@/i18n/routing'
import { getDocTypeSpec } from '@/lib/docintel/documentRegistry'
import { hasOfficialSchema } from '@/lib/translation/forms/ukraine/schemas/registry'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}
export const metadata: Metadata = { title: 'Supported documents — Messenginfo' }

const CLASSES: Array<{ id: string; icon: string; wizards: string[] }> = [
  { id: 'ua_internal_passport_booklet', icon: '🇺🇦', wizards: ['translator', 'tps'] },
  { id: 'ua_international_passport',    icon: '✈️', wizards: ['translator', 'tps', 'reparole'] },
  { id: 'ua_birth_certificate',         icon: '👶', wizards: ['translator'] },
  { id: 'ua_marriage_certificate',      icon: '💍', wizards: ['translator'] },
  { id: 'ua_divorce_certificate',       icon: '📜', wizards: ['translator'] },
  { id: 'ua_id_card',                   icon: '💳', wizards: ['translator', 'tps'] },
  { id: 'ua_military_id',               icon: '🪖', wizards: ['translator'] },
  { id: 'us_i94',                       icon: '🛬', wizards: ['tps', 'reparole'] },
  { id: 'us_ead',                       icon: '🪪', wizards: ['tps', 'reparole'] },
  { id: 'us_i797',                      icon: '📄', wizards: ['tps'] },
]

const T: Record<string, { title: string; sub: string; fields: string; handwritten: string; mirror: string; wizards: string; review_note: string; formats_note: string; names: Record<string, string> }> = {
  ru: {
    title: 'Поддерживаемые документы', sub: 'Что система читает, какие поля извлекает и как переводит.',
    fields: 'Извлекаемые поля', handwritten: 'рукописное — требует вашего подтверждения',
    mirror: 'Перевод «строчка-в-строчку» по официальной структуре', wizards: 'Доступен в',
    review_note: 'Рукописные значения никогда не финализируются автоматически — вы подтверждаете каждое.',
    formats_note: 'Форматы фото: JPEG, PNG, WEBP, HEIC (iPhone). До 10 МБ на страницу.',
    names: { ua_internal_passport_booklet: 'Паспорт Украины (книжка)', ua_international_passport: 'Загранпаспорт', ua_birth_certificate: 'Свидетельство о рождении', ua_marriage_certificate: 'Свидетельство о браке', ua_divorce_certificate: 'Свидетельство о расторжении брака', ua_id_card: 'ID-карта', ua_military_id: 'Военный билет', us_i94: 'I-94', us_ead: 'EAD (разрешение на работу)', us_i797: 'I-797 Notice' },
  },
  uk: {
    title: 'Підтримувані документи', sub: 'Що система читає, які поля витягує та як перекладає.',
    fields: 'Поля, що витягуються', handwritten: 'рукописне — потребує вашого підтвердження',
    mirror: 'Переклад «рядок-у-рядок» за офіційною структурою', wizards: 'Доступний у',
    review_note: 'Рукописні значення ніколи не фіналізуються автоматично — ви підтверджуєте кожне.',
    formats_note: 'Формати фото: JPEG, PNG, WEBP, HEIC (iPhone). До 10 МБ на сторінку.',
    names: { ua_internal_passport_booklet: 'Паспорт України (книжечка)', ua_international_passport: 'Закордонний паспорт', ua_birth_certificate: 'Свідоцтво про народження', ua_marriage_certificate: 'Свідоцтво про шлюб', ua_divorce_certificate: 'Свідоцтво про розірвання шлюбу', ua_id_card: 'ID-картка', ua_military_id: 'Військовий квиток', us_i94: 'I-94', us_ead: 'EAD (дозвіл на роботу)', us_i797: 'I-797 Notice' },
  },
  en: {
    title: 'Supported documents', sub: 'What the system reads, which fields it extracts, and how it translates them.',
    fields: 'Extracted fields', handwritten: 'handwritten — requires your confirmation',
    mirror: 'Line-by-line translation following the official structure', wizards: 'Available in',
    review_note: 'Handwritten values are never finalized automatically — you confirm each one.',
    formats_note: 'Photo formats: JPEG, PNG, WEBP, HEIC (iPhone). Up to 10 MB per page.',
    names: { ua_internal_passport_booklet: 'Ukrainian Passport (booklet)', ua_international_passport: 'International Passport', ua_birth_certificate: 'Birth Certificate', ua_marriage_certificate: 'Marriage Certificate', ua_divorce_certificate: 'Divorce Certificate', ua_id_card: 'ID Card', ua_military_id: 'Military ID', us_i94: 'I-94', us_ead: 'EAD (work permit)', us_i797: 'I-797 Notice' },
  },
  es: {
    title: 'Documentos compatibles', sub: 'Qué lee el sistema, qué campos extrae y cómo los traduce.',
    fields: 'Campos extraídos', handwritten: 'manuscrito — requiere su confirmación',
    mirror: 'Traducción línea por línea según la estructura oficial', wizards: 'Disponible en',
    review_note: 'Los valores manuscritos nunca se finalizan automáticamente: usted confirma cada uno.',
    formats_note: 'Formatos de foto: JPEG, PNG, WEBP, HEIC (iPhone). Hasta 10 MB por página.',
    names: { ua_internal_passport_booklet: 'Pasaporte de Ucrania (libreta)', ua_international_passport: 'Pasaporte internacional', ua_birth_certificate: 'Certificado de nacimiento', ua_marriage_certificate: 'Certificado de matrimonio', ua_divorce_certificate: 'Certificado de divorcio', ua_id_card: 'Tarjeta ID', ua_military_id: 'Cartilla militar', us_i94: 'I-94', us_ead: 'EAD (permiso de trabajo)', us_i797: 'I-797 Notice' },
  },
}
const WIZ_LABEL: Record<string, string> = { translator: 'Translator', tps: 'TPS', reparole: 'Re-Parole' }

export default async function SupportedDocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = T[locale] ?? T.en
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '40px 20px', color: 'var(--text-1)' }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>{t.title}</h1>
      <p style={{ color: 'var(--text-2, #666)', marginBottom: 28 }}>{t.sub}</p>
      <p style={{ background: 'var(--surface-1, #f6f4f0)', borderRadius: 12, padding: '12px 16px', fontSize: 14, marginBottom: 24 }}>
        🔍 {t.review_note}
      </p>
      <p style={{ color: 'var(--text-2, #666)', fontSize: 13, marginBottom: 24 }}>📷 {t.formats_note}</p>
      <div style={{ display: 'grid', gap: 16 }}>
        {CLASSES.map(({ id, icon, wizards }) => {
          const spec = getDocTypeSpec(id)
          if (!spec) return null
          const mirror = hasOfficialSchema(id)
          return (
            <details key={id} style={{ border: '1px solid var(--border, #e3ded6)', borderRadius: 14, padding: '14px 18px', background: 'var(--surface-1, #fff)' }}>
              <summary style={{ cursor: 'pointer', fontSize: 18, fontWeight: 600 }}>
                {icon} {t.names[id] ?? spec.title_en}
                {mirror && <span style={{ marginLeft: 10, fontSize: 12, color: '#2c7a4b' }}>✓ {t.mirror.split(' ')[0]}</span>}
              </summary>
              <div style={{ marginTop: 12, fontSize: 14 }}>
                <div style={{ marginBottom: 6 }}><strong>{t.wizards}:</strong> {wizards.map((w) => WIZ_LABEL[w]).join(' · ')}</div>
                {mirror && <div style={{ marginBottom: 6, color: '#2c7a4b' }}>✓ {t.mirror}</div>}
                <div style={{ marginBottom: 4 }}><strong>{t.fields} ({spec.fields.length}):</strong></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {spec.fields.map((f) => (
                    <li key={f.field}>
                      {f.label_uk} <code style={{ fontSize: 12, opacity: 0.6 }}>({f.field})</code>
                      {f.handwritten && <em style={{ color: '#a06b00' }}> — ✍️ {t.handwritten}</em>}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )
        })}
      </div>
    </main>
  )
}
