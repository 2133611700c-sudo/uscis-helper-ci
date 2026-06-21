'use client'

/**
 * PacketCompletenessChecker — pre-download summary card for TPS packet.
 *
 * Rendered above the attestation row in GeneratePacketBlock. Shows the
 * user — BEFORE they click Generate — exactly:
 *
 *   1. WHICH forms will be in the ZIP (I-821 always, I-765 conditional on
 *      "I also want a work permit" answer). Includes the page count and
 *      the USCIS edition the field map is pinned against. If the user
 *      accidentally said "no EAD" but actually wants it, this is the
 *      surface where they catch the mistake.
 *
 *   2. WHICH critical fields are still empty. Each missing field is
 *      shown in plain language. While ANY critical field is empty, the
 *      user sees red "обязательное поле" markers and a counter at the
 *      bottom. The Generate button gating is owned by GeneratePacketBlock
 *      (attestation + non-empty critical fields).
 *
 *   3. WHICH critical fields are filled — with a ✓. This is the trust
 *      signal that says "we have everything we need". A 60-year-old
 *      Ukrainian filer who is afraid of "missing a step" sees the list
 *      and confirms they have done their part.
 *
 *   4. WHERE the user must sign on paper after print. We do NOT sign on
 *      their behalf and the screen says so.
 *
 *   5. WHICH USCIS lockbox they will mail to. Phoenix for U4U / Ukraine
 *      TPS today. The actual lockbox link is rendered in the post-download
 *      success block of GeneratePacketBlock — here we just name it so the
 *      user is not surprised after download.
 *
 * Design rule: this component never opens or closes the wizard, never
 * persists anything, never calls the network. Pure presentation over the
 * answers the user has already typed (or OCR has filled).
 */

import type { ReactNode } from 'react'
import { lockboxFor } from '@/lib/tps/filingGuidance'
import { TPS_A11Y } from '@/lib/tps/a11y'

export type Locale = 'uk' | 'ru' | 'en' | 'es'

/** Subset of personal fields the checker inspects. Keep aligned with
 *  isMinimallyComplete() in lib/tps/answers.ts so what the UI shows
 *  here matches what the server-side validator will accept. */
export interface CheckerFields {
  family_name: string
  given_name: string
  dob: string
  sex: string
  country_of_birth: string
  passport_number: string
  passport_country_of_issuance: string
  passport_expiration_date: string
  us_address_street: string
  us_address_city: string
  us_address_state: string
  us_address_zip: string
  last_entry_date: string
  /** Required for I-821 Part 2 Item 17. Empty string = not yet selected. */
  marital_status: string
  daytime_phone: string
  email: string
}

export interface PacketCompletenessProps {
  locale: Locale
  fields: CheckerFields
  /** Has the user said yes to "also generate I-765 for work permit"? */
  wantsEad: boolean | null | undefined
  /** Filing path drives I-765 eligibility category copy (a12 vs c19). */
  filingPath: 'initial' | 're_registration' | 'unknown' | 'unselected'
  /** Whether the user has confirmed Part 7 background declaration review. */
  part7Reviewed?: boolean
}

interface RowSpec {
  key: keyof CheckerFields
  /** Translated label, e.g. "Фамилия". */
  label: string
}

interface CopyBundle {
  title: string
  formsHeading: string
  i821Line: (pages: number, ed: string) => string
  i765Line: (pages: number, ed: string) => string
  i765NotIncluded: string
  filledHeading: string
  missingHeading: string
  missingFooter: (n: number) => string
  signingHeading: string
  signI821: string
  signI765: string
  signWarning: string
  /** Effective 2026-07-10 (FR 2026-09289): USCIS may deny AND keep fee for invalid signature */
  signDenyFeeWarning: string
  feeHeading: string
  feeWaiverNote: string
  feeHr1Note: string
  feeVerifyLink: string
  sourceSnapshotNote: string
  lockboxHeading: string
  // OC-2 fix: lockbox shown is the ACTUAL one matched to the user's
  // state of residence. Phoenix-vs-Chicago is a per-state question for
  // TPS Ukraine paper filing (verbatim from uscis.gov/.../TPS-Ukraine
  // snapshot 2026-05-10). Showing "Phoenix" to a New York filer while
  // the README points to Chicago is the kind of drift that kills trust.
  lockboxKnown: (lockboxName: string, state: string) => string
  lockboxUnknown: (state: string) => string
  lockboxNoState: string
  rowLabels: Record<keyof CheckerFields, string>
  /** Part 7 confirmation copy */
  part7Required: string
}

const COPY: Record<Locale, CopyBundle> = {
  uk: {
    title: 'Що буде у пакеті',
    formsHeading: 'Форми у ZIP-архіві',
    i821Line: (pages, ed) => `I-821 — заява на TPS (${pages} стор., редакція USCIS ${ed})`,
    i765Line: (pages, ed) => `I-765 — заява на дозвіл на роботу (${pages} стор., редакція USCIS ${ed})`,
    i765NotIncluded: 'I-765 не включено (ви не запросили дозвіл на роботу)',
    filledHeading: 'Поля, які ми вже маємо',
    missingHeading: 'Потрібно ще заповнити',
    missingFooter: (n) => `Залишилось обов'язкових полів: ${n}`,
    signingHeading: 'Підпис на роздрукованому пакеті (тільки при поданні поштою)',
    signI821: 'I-821 — Частина 8 на сторінці 10. Чорна або синя ручка.',
    signI765: 'I-765 — Частина 3 на сторінці 4. Чорна або синя ручка.',
    signWarning: 'Ми НЕ підписуємо за вас. Підпис потрібно поставити від руки після друку. До перекладів документів це не стосується.',
    signDenyFeeWarning: '⚠ Тільки для поштової подачі (з 10 липня 2026): USCIS може ВІДХИЛИТИ роздруковану заяву і УТРИМАТИ ВАШ ЗБІР, якщо підпис на формах I-821/I-765 недійсний — скопійований, набраний текстом або зроблений програмою. До перекладів документів це правило не стосується. Підписуйте тільки від руки ручкою.',
    feeHeading: 'Державний збір USCIS',
    feeWaiverNote: 'Форма I-912 (звільнення від збору) поширюється лише на стандартні збори USCIS: I-821, біометрія, I-765.',
    feeHr1Note: '⚠ Збори, встановлені законом H.R.1 (з 29 травня 2026), — НЕ скасовуються через I-912. Перевірте поточні збори перед відправкою.',
    feeVerifyLink: 'Перевірити збори: uscis.gov/feecalculator',
    sourceSnapshotNote: 'Дані правил перевірено: 12 травня 2026. Завжди звіряйтеся з офіційним сайтом USCIS перед поданням.',
    lockboxHeading: 'Куди надсилати',
    lockboxKnown: (name, state) =>
      `${name} (для жителів штату ${state}). Повна адреса з'явиться у README після генерації пакета. Завжди перевіряйте її на офіційній сторінці USCIS перед відправкою.`,
    lockboxUnknown: (state) =>
      `Для штату «${state}» ми не змогли визначити адресу автоматично. Перевірте офіційну сторінку USCIS перед відправкою.`,
    lockboxNoState: 'Вкажіть штат — ми покажемо точну адресу USCIS Lockbox для вашого штату.',
    rowLabels: {
      family_name: 'Прізвище', given_name: 'Ім\'я', dob: 'Дата народження', sex: 'Стать',
      country_of_birth: 'Країна народження',
      passport_number: 'Номер паспорта', passport_country_of_issuance: 'Країна видачі паспорта',
      passport_expiration_date: 'Паспорт дійсний до',
      us_address_street: 'Адреса в США (вулиця)', us_address_city: 'Місто', us_address_state: 'Штат',
      us_address_zip: 'ZIP-код',
      last_entry_date: 'Дата в\'їзду в США',
      marital_status: 'Сімейний стан',
      daytime_phone: 'Денний телефон', email: 'Email',
    },
    part7Required: '⚠ Декларацію Part 7 ще не підтверджено.',
  },
  ru: {
    title: 'Что будет в пакете',
    formsHeading: 'Формы в ZIP-архиве',
    i821Line: (pages, ed) => `I-821 — заявление на TPS (${pages} стр., редакция USCIS ${ed})`,
    i765Line: (pages, ed) => `I-765 — заявление на разрешение на работу (${pages} стр., редакция USCIS ${ed})`,
    i765NotIncluded: 'I-765 не включён (вы не запросили разрешение на работу)',
    filledHeading: 'Поля, которые у нас уже есть',
    missingHeading: 'Нужно ещё заполнить',
    missingFooter: (n) => `Осталось обязательных полей: ${n}`,
    signingHeading: 'Подпись на распечатанном пакете (только при подаче по почте)',
    signI821: 'I-821 — Часть 8 на странице 10. Чёрная или синяя ручка.',
    signI765: 'I-765 — Часть 3 на странице 4. Чёрная или синяя ручка.',
    signWarning: 'Мы НЕ подписываем за вас. Подпись нужно поставить вручную после печати. К переводам документов это не относится.',
    signDenyFeeWarning: '⚠ Только для подачи по почте (с 10 июля 2026): USCIS может ОТКЛОНИТЬ распечатанное заявление и УДЕРЖАТЬ ВАШ СБОР, если подпись на формах I-821/I-765 недействительна — скопирована, напечатана текстом или создана программой. К переводам документов это правило не относится. Подписывайте только от руки ручкой.',
    feeHeading: 'Государственный сбор USCIS',
    feeWaiverNote: 'Форма I-912 (освобождение от сбора) распространяется только на стандартные сборы USCIS: I-821, биометрия, I-765.',
    feeHr1Note: '⚠ Сборы, установленные законом H.R.1 (с 29 мая 2026), НЕ отменяются через I-912. Проверьте текущие сборы перед отправкой.',
    feeVerifyLink: 'Проверить сборы: uscis.gov/feecalculator',
    sourceSnapshotNote: 'Данные правил проверены: 12 мая 2026. Всегда сверяйтесь с официальным сайтом USCIS перед подачей.',
    lockboxHeading: 'Куда отправлять',
    lockboxKnown: (name, state) =>
      `${name} (для жителей штата ${state}). Полный адрес появится в README после генерации пакета. Всегда сверяйте его с официальной страницей USCIS перед отправкой.`,
    lockboxUnknown: (state) =>
      `Для штата «${state}» мы не смогли определить адрес автоматически. Сверьтесь с официальной страницей USCIS перед отправкой.`,
    lockboxNoState: 'Укажите штат — мы покажем точный адрес USCIS Lockbox для вашего штата.',
    rowLabels: {
      family_name: 'Фамилия', given_name: 'Имя', dob: 'Дата рождения', sex: 'Пол',
      country_of_birth: 'Страна рождения',
      passport_number: 'Номер паспорта', passport_country_of_issuance: 'Страна выдачи паспорта',
      passport_expiration_date: 'Паспорт действителен до',
      us_address_street: 'Адрес в США (улица)', us_address_city: 'Город', us_address_state: 'Штат',
      us_address_zip: 'ZIP-код',
      last_entry_date: 'Дата въезда в США',
      marital_status: 'Семейное положение',
      daytime_phone: 'Дневной телефон', email: 'Email',
    },
    part7Required: '⚠ Декларация Part 7 ещё не подтверждена.',
  },
  en: {
    title: 'What will be in your packet',
    formsHeading: 'Forms in the ZIP file',
    i821Line: (pages, ed) => `I-821 — TPS Application (${pages} pages, USCIS edition ${ed})`,
    i765Line: (pages, ed) => `I-765 — Application for Employment Authorization (${pages} pages, USCIS edition ${ed})`,
    i765NotIncluded: 'I-765 not included (you did not request a work permit)',
    filledHeading: 'Fields we already have',
    missingHeading: 'Still need from you',
    missingFooter: (n) => `Required fields remaining: ${n}`,
    signingHeading: 'Signature on the printed packet (mail filing only)',
    signI821: 'I-821 — Part 8 on page 10. Black or blue ink.',
    signI765: 'I-765 — Part 3 on page 4. Black or blue ink.',
    signWarning: 'We do NOT sign for you. You must sign by hand after printing. This does not apply to document translations.',
    signDenyFeeWarning: '⚠ Mail filing only (from July 10, 2026): USCIS may DENY the printed application and KEEP YOUR FILING FEE if the signature on forms I-821/I-765 is invalid — copied image, typed name, or software-generated. This rule does not apply to document translations. Sign by hand in ink only.',
    feeHeading: 'USCIS government fee',
    feeWaiverNote: 'Form I-912 (fee waiver) covers standard USCIS base fees only: I-821, biometrics, I-765.',
    feeHr1Note: '⚠ Fees required by H.R.1 (effective May 29, 2026) CANNOT be waived via I-912 — they are non-waivable by statute. Verify current fees before mailing.',
    feeVerifyLink: 'Verify fees: uscis.gov/feecalculator',
    sourceSnapshotNote: 'Rules verified: May 12, 2026. Always check the official USCIS site before filing.',
    lockboxHeading: 'Where to mail',
    lockboxKnown: (name, state) =>
      `${name} (for ${state} residents). The full address will appear in the README inside your downloaded ZIP. Always verify against the official USCIS page before mailing.`,
    lockboxUnknown: (state) =>
      `We could not determine the lockbox for "${state}" automatically. Verify on the official USCIS page before mailing.`,
    lockboxNoState: 'Enter your state — we will show the exact USCIS Lockbox address for it.',
    rowLabels: {
      family_name: 'Family name', given_name: 'Given name', dob: 'Date of birth', sex: 'Sex',
      country_of_birth: 'Country of birth',
      passport_number: 'Passport number', passport_country_of_issuance: 'Passport country of issuance',
      passport_expiration_date: 'Passport expiration',
      us_address_street: 'US address (street)', us_address_city: 'City', us_address_state: 'State',
      us_address_zip: 'ZIP code',
      last_entry_date: 'Date of last entry to the US',
      marital_status: 'Marital status',
      daytime_phone: 'Daytime phone', email: 'Email',
    },
    part7Required: '⚠ Part 7 background declaration not yet confirmed.',
  },
  es: {
    title: 'Lo que estará en su paquete',
    formsHeading: 'Formularios en el ZIP',
    i821Line: (pages, ed) => `I-821 — Solicitud de TPS (${pages} pág., edición USCIS ${ed})`,
    i765Line: (pages, ed) => `I-765 — Solicitud de permiso de trabajo (${pages} pág., edición USCIS ${ed})`,
    i765NotIncluded: 'I-765 no incluido (no solicitó permiso de trabajo)',
    filledHeading: 'Campos que ya tenemos',
    missingHeading: 'Aún falta completar',
    missingFooter: (n) => `Campos obligatorios pendientes: ${n}`,
    signingHeading: 'Firma en el paquete impreso (solo para envío por correo)',
    signI821: 'I-821 — Parte 8 en la página 10. Tinta negra o azul.',
    signI765: 'I-765 — Parte 3 en la página 4. Tinta negra o azul.',
    signWarning: 'NO firmamos por usted. Debe firmar a mano después de imprimir. Esto no aplica a traducciones de documentos.',
    signDenyFeeWarning: '⚠ Solo para envío por correo (desde el 10 jul 2026): USCIS puede RECHAZAR la solicitud impresa y RETENER SU TARIFA si la firma en los formularios I-821/I-765 es inválida — imagen copiada, nombre mecanografiado o firma de software. Esta regla no aplica a traducciones de documentos. Firme solo a mano con tinta.',
    feeHeading: 'Tarifa gubernamental de USCIS',
    feeWaiverNote: 'El formulario I-912 (exención de tarifa) cubre solo las tarifas base estándar de USCIS: I-821, biometría, I-765.',
    feeHr1Note: '⚠ Las tarifas exigidas por H.R.1 (vigentes desde el 29 may 2026) NO pueden eximirse mediante I-912 — son obligatorias por ley. Verifique las tarifas actuales antes de enviar.',
    feeVerifyLink: 'Verificar tarifas: uscis.gov/feecalculator',
    sourceSnapshotNote: 'Reglas verificadas: 12 de mayo de 2026. Siempre consulte el sitio oficial de USCIS antes de presentar.',
    lockboxHeading: 'Adónde enviar',
    lockboxKnown: (name, state) =>
      `${name} (para residentes de ${state}). La dirección completa aparecerá en el README del ZIP descargado. Verifíquela siempre en la página oficial de USCIS antes de enviar.`,
    lockboxUnknown: (state) =>
      `No pudimos determinar la lockbox para "${state}" automáticamente. Verifique en la página oficial de USCIS antes de enviar.`,
    lockboxNoState: 'Indique su estado — mostraremos la dirección exacta del USCIS Lockbox.',
    rowLabels: {
      family_name: 'Apellido', given_name: 'Nombre', dob: 'Fecha de nacimiento', sex: 'Sexo',
      country_of_birth: 'País de nacimiento',
      passport_number: 'Número de pasaporte', passport_country_of_issuance: 'País de emisión del pasaporte',
      passport_expiration_date: 'Vencimiento del pasaporte',
      us_address_street: 'Dirección en EE. UU. (calle)', us_address_city: 'Ciudad', us_address_state: 'Estado',
      us_address_zip: 'Código ZIP',
      last_entry_date: 'Fecha de última entrada a EE. UU.',
      marital_status: 'Estado civil',
      daytime_phone: 'Teléfono diurno', email: 'Email',
    },
    part7Required: '⚠ Declaración de la Parte 7 aún no confirmada.',
  },
}

// Critical fields list + edition strings — pulled from the single
// source of truth at lib/services/tps/config.ts. This kills the four-
// place drift risk (Checker / packetBuilder / health probe / answers).
import { TPS_CRITICAL_FIELDS, TPS_FORMS } from '@/lib/services/tps/config'

const CRITICAL_FIELDS: ReadonlyArray<keyof CheckerFields> =
  TPS_CRITICAL_FIELDS as ReadonlyArray<keyof CheckerFields>
const I821_EDITION = TPS_FORMS.i821.edition
const I821_PAGES = TPS_FORMS.i821.pages
const I765_EDITION = TPS_FORMS.i765.edition
const I765_PAGES = TPS_FORMS.i765.pages

function isFilled(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

export function PacketCompletenessChecker(props: PacketCompletenessProps): ReactNode {
  const c = COPY[props.locale]

  const missing: Array<keyof CheckerFields> = []
  const filled: Array<keyof CheckerFields> = []
  for (const k of CRITICAL_FIELDS) {
    if (isFilled(props.fields[k])) {
      filled.push(k)
    } else {
      missing.push(k)
    }
  }

  const includeI765 = props.wantsEad === true

  // ── Section wrapper ────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '14px 16px',
    marginTop: 18,
  }
  const sectionHeader: React.CSSProperties = {
    // A11Y: section header 12→14, color text-3→text-2
    fontSize: TPS_A11Y.TEXT_LABEL,
    fontWeight: TPS_A11Y.WEIGHT_HEAVY,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    color: 'var(--text-2)',
    marginTop: 16,
    marginBottom: 8,
  }
  const liBase: React.CSSProperties = {
    // A11Y: row text 13→15 — these are checklist items the user
    // verifies before mailing USCIS, must be comfortably readable.
    fontSize: 15,
    lineHeight: TPS_A11Y.LINE_HEIGHT_BODY,
    padding: '6px 0',
    color: 'var(--text-1)',
  }

  return (
    <section
      data-testid="tps-packet-checker"
      style={card}
      aria-label={c.title}
    >
      <h3
        style={{
          // A11Y: card title 16→18
          fontSize: TPS_A11Y.TEXT_PRIMARY_VALUE,
          fontWeight: TPS_A11Y.WEIGHT_HEAVY,
          color: 'var(--text-1)',
          marginBottom: 4,
        }}
      >
        {c.title}
      </h3>

      {/* Forms in the ZIP */}
      <p style={sectionHeader}>{c.formsHeading}</p>
      <ul style={{ paddingLeft: 18, margin: 0 }} data-testid="checker-forms">
        <li style={liBase} data-testid="checker-form-i821">
          {c.i821Line(I821_PAGES, I821_EDITION)}
        </li>
        {includeI765 ? (
          <li style={liBase} data-testid="checker-form-i765">
            {c.i765Line(I765_PAGES, I765_EDITION)}
          </li>
        ) : (
          <li style={{ ...liBase, color: 'var(--text-3)', fontStyle: 'italic' }} data-testid="checker-form-i765-skipped">
            {c.i765NotIncluded}
          </li>
        )}
      </ul>

      {/* Filled fields */}
      {filled.length > 0 && (
        <>
          <p style={sectionHeader}>{c.filledHeading}</p>
          <ul style={{ paddingLeft: 0, margin: 0, listStyle: 'none' }} data-testid="checker-filled">
            {filled.map((k) => (
              <li
                key={k}
                style={{
                  ...liBase,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'baseline',
                }}
              >
                <span style={{ color: 'var(--success, #16a34a)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                <span>{c.rowLabels[k]}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Missing critical fields */}
      {missing.length > 0 && (
        <>
          <p style={{ ...sectionHeader, color: 'var(--danger-text, #991b1b)' }}>
            {c.missingHeading}
          </p>
          <ul style={{ paddingLeft: 0, margin: 0, listStyle: 'none' }} data-testid="checker-missing">
            {missing.map((k) => (
              <li
                key={k}
                style={{
                  ...liBase,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'baseline',
                  color: 'var(--danger-text, #991b1b)',
                }}
                data-testid={`checker-missing-${k}`}
              >
                <span style={{ fontWeight: 700, flexShrink: 0 }}>•</span>
                <span>{c.rowLabels[k]}</span>
              </li>
            ))}
          </ul>
          <p
            style={{
              // A11Y: missing-fields count is the user's main signal
              // of incompleteness — bumped 12→15.
              fontSize: 15,
              color: 'var(--danger-text, #991b1b)',
              fontWeight: TPS_A11Y.WEIGHT_BOLD,
              marginTop: 10,
            }}
            data-testid="checker-missing-footer"
          >
            {c.missingFooter(missing.length)}
          </p>
        </>
      )}

      {/* Part 7 hard-stop warning — shown when user has not yet confirmed */}
      {props.part7Reviewed === false && (
        <p
          data-testid="checker-part7-required"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--danger-text, #991b1b)',
            background: 'var(--danger-bg, #fee2e2)',
            padding: '8px 10px',
            borderRadius: 8,
            marginTop: 10,
            lineHeight: 1.4,
          }}
        >
          {c.part7Required}
        </p>
      )}

      {/* Signing on paper */}
      <p style={sectionHeader}>{c.signingHeading}</p>
      <ul style={{ paddingLeft: 18, margin: 0 }} data-testid="checker-signing">
        <li style={liBase}>{c.signI821}</li>
        {includeI765 && <li style={liBase}>{c.signI765}</li>}
      </ul>
      <p
        style={{
          fontSize: TPS_A11Y.TEXT_DISCLAIMER,
          fontWeight: TPS_A11Y.WEIGHT_MEDIUM,
          color: 'var(--text-2)',
          marginTop: 8,
          fontStyle: 'italic',
        }}
      >
        {c.signWarning}
      </p>
      {/* Signature rule warning — FR doc 2026-09289, effective 2026-07-10 */}
      <p
        data-testid="checker-sign-deny-fee-warning"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--warning-text, #92400e)',
          background: 'var(--warning-bg, #fef3c7)',
          padding: '8px 10px',
          borderRadius: 8,
          marginTop: 8,
          lineHeight: 1.45,
        }}
      >
        {c.signDenyFeeWarning}
      </p>

      {/* Government fee check — H.R.1 rule, effective 2026-05-29 */}
      <p style={{ ...sectionHeader, marginTop: 16 }} data-testid="checker-fee-heading">{c.feeHeading}</p>
      <p style={{ ...liBase, marginBottom: 4 }}>{c.feeWaiverNote}</p>
      <p
        data-testid="checker-hr1-fee-warning"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--warning-text, #92400e)',
          background: 'var(--warning-bg, #fef3c7)',
          padding: '8px 10px',
          borderRadius: 8,
          marginTop: 4,
          lineHeight: 1.45,
        }}
      >
        {c.feeHr1Note}
      </p>
      <a
        href="https://www.uscis.gov/feecalculator"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="checker-fee-link"
        style={{
          display: 'block',
          marginTop: 6,
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--primary)',
          textDecoration: 'none',
        }}
      >
        {c.feeVerifyLink} ↗
      </a>

      {/* Source snapshot date */}
      <p
        data-testid="checker-source-snapshot"
        style={{
          fontSize: 11,
          color: 'var(--text-3)',
          marginTop: 14,
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}
      >
        {c.sourceSnapshotNote}
      </p>

      {/* Lockbox — OC-2 fix: state-driven, not hardcoded Phoenix */}
      <p style={sectionHeader}>{c.lockboxHeading}</p>
      <p style={{ ...liBase, marginBottom: 0 }} data-testid="checker-lockbox">
        {renderLockboxLine(props.fields.us_address_state, c)}
      </p>
    </section>
  )
}

/** Pure helper: pick the right lockbox copy variant based on what the
 *  user has typed for their state. Exposed for test reuse. */
export function renderLockboxLine(
  stateInput: string | undefined | null,
  c: CopyBundle,
): string {
  const state = (stateInput || '').trim().toUpperCase()
  if (!state) return c.lockboxNoState
  const result = lockboxFor(state)
  if (result.ok) {
    return c.lockboxKnown(result.lockbox.display_name, state)
  }
  return c.lockboxUnknown(state)
}
