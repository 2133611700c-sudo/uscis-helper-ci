'use client'

/**
 * GeneratePacketBlock — final block on ScreenS5 of the TPS wizard.
 *
 * Collects the personal data the wizard hasn't gathered yet (name, DOB,
 * address, passport, phone/email) and hits POST /api/tps/generate-packet
 * to download a ZIP with prefilled I-821 + (optionally) I-765 PDFs.
 *
 * Drop-in component — no Supabase, no localStorage of its own; it reads
 * filing_path and wants_ead from the parent wizard's existing answers.
 *
 * Locked rules (enforced by content-guard CI):
 *  - No claim of USCIS acceptance or filing on the user's behalf.
 *  - No attorney-style guidance — we are not a law firm.
 *  - PDFs come back stamped "DRAFT — REVIEW & SIGN BEFORE MAILING".
 *  - Server route validates required fields and refuses incomplete submissions.
 */

import { useState, useEffect, useRef } from 'react'
import {
  isLedgerClientEnabled,
  saveDraftToServer,
  loadDraftFromServer,
  clearServerDraft,
} from '@/lib/v1/wizardLedgerClient'
import type { TPSAnswers } from '@/lib/tps/answers'
import type { TpsExtractedField } from '@/lib/tps/types'
import { runMailReadyGate } from '@/lib/tps/mailReadyGate'
import { PacketCompletenessChecker } from '@/components/tps/PacketCompletenessChecker'
import {
  LegalRiskFlags,
  EMPTY_LEGAL_RISK,
  type LegalRiskValue,
} from '@/components/tps/LegalRiskFlags'

type Locale = 'uk' | 'ru' | 'en' | 'es'

interface Props {
  locale: Locale
  filingPath: 'initial' | 're_registration' | 'unknown' | 'unselected'
  wantsEad: boolean | null | undefined
  /**
   * Optional OCR-extracted fields. When provided, they seed the form's
   * initial state — only filling in fields the user has not already typed
   * (localStorage values win over OCR). This keeps the existing flow for
   * users who chose to type manually while letting the OCR path prefill
   * fresh sessions.
   */
  preExtracted?: TpsExtractedField[]
  /** Knowledge-detected conflicts from OCR normalization. */
  knowledgeConflicts?: Array<{ field: string; reason: string }>
  /** Low-confidence OCR fields that need user verification. */
  knowledgeLowConfidence?: Array<{ field: string; confidence: number }>
}

/**
 * Apply OCR-extracted fields onto a PersonalFields object.
 * OCR values fill ONLY empty slots — anything the user has already typed
 * (rehydrated from localStorage) wins. This avoids the "I edited my name
 * and it got overwritten" trap.
 */
function applyPreExtracted(
  base: PersonalFields,
  preExtracted: TpsExtractedField[] | undefined,
): PersonalFields {
  if (!preExtracted || preExtracted.length === 0) return base
  const next = { ...base }
  // Whitelist: only fields that exist on PersonalFields. Fields like
  // ead_category_on_card and ead_expiration_date are deliberately NOT
  // listed — ead_category is driven from filing_path on the server side,
  // and an existing EAD's expiration is not a USCIS-form input on I-821/
  // I-765 (it's reference info for the user, not data we write to a
  // form).
  //
  // I-94 class_of_admission maps to TPSAnswers.status_at_last_entry which
  // lands on I-765 Page 3 Line 23.
  // EAD a_number maps to TPSAnswers.a_number which lands on
  //   I-821 Part 2 Item 7 (Page 02) AND I-765 Part 2 Line 7 (Page 2).
  const fieldMap: Record<string, keyof PersonalFields> = {
    family_name: 'family_name',
    given_name: 'given_name',
    middle_name: 'middle_name',
    dob: 'dob',
    sex: 'sex',
    country_of_birth: 'country_of_birth',
    passport_number: 'passport_number',
    passport_country_of_issuance: 'passport_country_of_issuance',
    passport_expiration_date: 'passport_expiration_date',
    i94_admission_number: 'i94_admission_number',
    last_entry_date: 'last_entry_date',
    a_number: 'a_number',
    i94_class_of_admission: 'status_at_last_entry',
    // city_of_birth and ssn are not emitted by any current OCR module;
    // include them so future modules can auto-fill without a code change here.
    city_of_birth: 'city_of_birth',
    ssn: 'ssn',
  }
  for (const f of preExtracted) {
    const key = fieldMap[f.field]
    if (!key) continue
    if (next[key] && next[key].toString().trim() !== '') continue // user value wins
    const val = f.normalized_value
    if (val == null || val.toString().trim() === '') continue
    if (key === 'sex') {
      // Coerce to 'M' | 'F' | ''
      const v = val.toString().toUpperCase().charAt(0)
      next.sex = v === 'M' || v === 'F' ? v : ''
    } else {
      // PersonalFields string fields — safe cast via unknown.
      ;(next as unknown as Record<string, string>)[key] = val.toString()
    }
  }
  return next
}

interface PersonalFields {
  family_name: string
  given_name: string
  middle_name: string
  dob: string             // YYYY-MM-DD
  sex: 'M' | 'F' | ''
  country_of_birth: string
  passport_number: string
  passport_country_of_issuance: string
  passport_expiration_date: string  // YYYY-MM-DD
  us_address_street: string
  us_address_city: string
  us_address_state: string
  us_address_zip: string
  mailing_different: boolean
  mailing_street: string
  mailing_city: string
  mailing_state: string
  mailing_zip: string
  i94_admission_number: string
  last_entry_date: string  // YYYY-MM-DD
  daytime_phone: string
  email: string
  /** A-Number (Alien Registration Number) — 9 digits, no 'A' prefix.
   *  Sourced from EAD card OCR; user can edit. Empty when the applicant
   *  doesn't have one yet (most initial TPS filers). */
  a_number: string
  /** Status at last entry, e.g. "Parole", "B-2", "UH". Sourced from
   *  I-94 OCR (Class of Admission field). Auto-defaults to "UH" for U4U
   *  parolees when blank and the user marked TPS-Ukraine path. */
  status_at_last_entry: string
  /** City of birth — I-821 Part 2 Item 13, I-765 Line 18a. Not on any
   *  OCR-supported document today; user types it manually. */
  city_of_birth: string
  /** Social Security Number — 9 digits, no dashes. Optional: most
   *  initial TPS filers don't have one yet. */
  ssn: string
  /** Marital status — required for I-821 Part 2 Item 17. */
  marital_status: 'single' | 'married' | 'divorced' | 'widowed' | 'legally_separated' | 'annulled' | 'other' | ''
  /** I-765 application type — required when wants_ead. */
  i765_application_type: 'initial' | 'replacement' | 'renewal' | ''
  // Part 3 — Biographic
  ethnicity: 'hispanic' | 'not_hispanic' | ''
  eye_color: 'black' | 'blue' | 'brown' | 'gray' | 'green' | 'hazel' | 'maroon' | 'pink' | 'unknown' | ''
  hair_color: 'bald' | 'black' | 'blonde' | 'brown' | 'gray' | 'red' | 'sandy' | 'white' | 'unknown' | ''
  race_white: boolean
  race_asian: boolean
  race_black: boolean
  race_american_indian: boolean
  race_pacific_islander: boolean
}

/**
 * Part 7 yes/no background declaration — kept separate from PersonalFields
 * to keep the localStorage shape clean and allow independent reset.
 */
interface Part7State {
  // Criminal (Page 7)
  q4a: boolean; q4b: boolean; q4c: boolean
  // DUI (Page 7-8)
  q5a: boolean; q5b: boolean; q5c: boolean
  // Persecution (Page 8)
  q7a: boolean; q7b: boolean; q7c: boolean
  // Domestic violence (Page 8)
  q8: boolean
  // Immigration fraud (Page 8)
  q9a: boolean; q9b: boolean; q9c: boolean; q9d: boolean; q9e: boolean
  // Removal/exclusion (Page 8)
  q11a: boolean; q11b: boolean; q11c: boolean; q11d: boolean
  // Prior TPS (Page 8)
  q12a: boolean; q12b: boolean; q12c: boolean; q12d: boolean
  // Benefit fraud (Page 8)
  q13a: boolean; q13b: boolean; q13c: boolean
  // Prior filing/proceedings (Page 9)
  q17: boolean; q18a: boolean; q18b: boolean; q18c: boolean
  /** User has reviewed all questions above and confirmed their answers. */
  reviewed: boolean
}

const EMPTY: PersonalFields = {
  family_name: '', given_name: '', middle_name: '',
  dob: '', sex: '',
  country_of_birth: 'Ukraine',
  passport_number: '', passport_country_of_issuance: 'Ukraine', passport_expiration_date: '',
  us_address_street: '', us_address_city: '', us_address_state: '', us_address_zip: '',
  mailing_different: false, mailing_street: '', mailing_city: '', mailing_state: '', mailing_zip: '',
  i94_admission_number: '', last_entry_date: '',
  daytime_phone: '', email: '',
  a_number: '', status_at_last_entry: '',
  city_of_birth: '', ssn: '',
  marital_status: '', i765_application_type: '',
  ethnicity: '', eye_color: '', hair_color: '',
  race_white: false, race_asian: false, race_black: false,
  race_american_indian: false, race_pacific_islander: false,
}

const EMPTY_PART7: Part7State = {
  q4a: false, q4b: false, q4c: false,
  q5a: false, q5b: false, q5c: false,
  q7a: false, q7b: false, q7c: false,
  q8: false,
  q9a: false, q9b: false, q9c: false, q9d: false, q9e: false,
  q11a: false, q11b: false, q11c: false, q11d: false,
  q12a: false, q12b: false, q12c: false, q12d: false,
  q13a: false, q13b: false, q13c: false,
  q17: false, q18a: false, q18b: false, q18c: false,
  reviewed: false,
}

const STORAGE_KEY_PART7 = 'wizard:tps-ukraine:part7:v1'

const STORAGE_KEY = 'wizard:tps-ukraine:personal:v1'

const COPY = {
  uk: {
    toggleOpen: '↓ Заповнити готовий PDF-пакет (чернетка)',
    toggleClose: '✕ Закрити',
    heading: 'Заповнити готові I-821 + I-765 (чернетка)',
    intro: 'Введіть дані, які USCIS просить у формі. Ми згенеруємо PDF із вашими відповідями вже у клітинках. Ви потім роздрукуєте, підпишете і подаєте самі.',
    family: 'Прізвище (Family Name)', given: 'Ім\'я (Given Name)', middle: 'По батькові (Middle Name) — необов\'язково',
    dob: 'Дата народження', sex: 'Стать', male: 'Чоловіча', female: 'Жіноча',
    cityob: 'Місто народження', cob: 'Країна народження',
    ssn: 'SSN (9 цифр, без дефісів) — якщо є',
    aNumber: 'A-Number (9 цифр без літери A) — якщо є',
    statusEntry: 'Статус на момент останнього в\'їзду (напр. "UH", "Parole", "B-2")',
    maritalStatus: 'Сімейний стан (обов\'язково)',
    ms_single: 'Не одружений/незаміжня', ms_married: 'Одружений/Заміжня',
    ms_divorced: 'Розлучений/Розлучена', ms_widowed: 'Вдівець/Вдова',
    ms_separated: 'Юридично розлучений/а', ms_annulled: 'Анульований шлюб', ms_other: 'Інший',
    i765type: 'Тип заяви I-765 (дозвіл на роботу)',
    i765_initial: 'Первинний дозвіл', i765_renewal: 'Продовження', i765_replacement: 'Заміна картки',
    bioHeading: 'Біографічні дані (Part 3 I-821)',
    ethnicity: 'Етнічна приналежність', eth_hispanic: 'Іспаномовного / латиноамериканського походження', eth_not: 'Не іспаномовного походження',
    eyeColor: 'Колір очей', hairColor: 'Колір волосся',
    eye_black: 'Чорний', eye_blue: 'Синій', eye_brown: 'Карий', eye_gray: 'Сірий', eye_green: 'Зелений', eye_hazel: 'Горіховий', eye_maroon: 'Темно-каштановий', eye_pink: 'Рожевий', eye_unknown: 'Невідомий',
    hair_bald: 'Лисий', hair_black: 'Чорне', hair_blonde: 'Русяве/Світле', hair_brown: 'Каштанове', hair_gray: 'Сиве', hair_red: 'Руде', hair_sandy: 'Піщане', hair_white: 'Сиве/Біле', hair_unknown: 'Невідомий',
    race: 'Раса (можна кілька)',
    race_white: 'Біла раса', race_asian: 'Азіатська', race_black: 'Чорна / афроамериканська', race_ai: 'Корінні американці / Аляска', race_pi: 'Тихоокеанські острови',
    part7Heading: '⚠ Декларація щодо минулого (Part 7 I-821) — обов\'язково перевірте',
    part7Intro: 'USCIS вимагає відповідей на всі питання нижче. Ми поставили "Ні" за замовчуванням — це відповідь для переважної більшості заявників. Якщо будь-яка відповідь "Так" для вас — змініть її. Прочитайте кожне питання перед підписом.',
    part7Confirm: 'Я прочитав/прочитала кожне питання і підтверджую, що відповіді правильні.',
    part7ConfirmRequired: 'Потрібно підтвердити перевірку Part 7 перед генерацією.',
    part7AttorneyWarning: '⚠ Ви відповіли "Так" на одне або більше питань. Рекомендуємо проконсультуватися з ліцензованим імміграційним адвокатом або акредитованим представником DOJ перед поданням.',
    // Part 7 question texts (uk)
    p7_4a: '4a. Ви будь-коли вчиняли злочин будь-якого роду (включаючи ті, за які вас не заарештовували)?',
    p7_4b: '4b. Вас будь-коли заарештовували, висували звинувачення або затримували?',
    p7_4c: '4c. Вас будь-коли засуджували за злочин?',
    p7_5a: '5a. Вас будь-коли заарештовували або цитували за керування автомобілем у нетверезому стані?',
    p7_5b: '5b. Ви будь-коли керували транспортним засобом у нетверезому стані без арешту?',
    p7_5c: '5c. Вас будь-коли засуджували за керування у нетверезому стані?',
    p7_7a: '7a. Ви будь-коли наказували, підбурювали або вчиняли акти катування, геноциду чи масового насильства?',
    p7_7b: '7b. Ви будь-коли брали участь у переслідуванні будь-якої особи?',
    p7_7c: '7c. Ви член/офіцер військового, воєнізованого або поліцейського підрозділу, що вчиняв зловживання?',
    p7_8: '8. Вас будь-коли засуджували за домашнє насильство, переслідування або порушення охоронного ордера?',
    p7_9a: '9a. Ви будь-коли спотворювали факти для отримання імміграційної пільги?',
    p7_9b: '9b. Ви будь-коли хибно заявляли про громадянство США?',
    p7_9c: '9c. Ви будь-коли отримували або використовували підроблений паспорт США?',
    p7_9d: '9d. Ви будь-коли подавали підроблені документи до федерального/державного органу?',
    p7_9e: '9e. Ви будь-коли практикували незаконну полігамію?',
    p7_11a: '11a. Щодо вас будь-коли порушували справу про видворення/виключення?',
    p7_11b: '11b. Суддя будь-коли виносив остаточне рішення про ваше видворення/виключення?',
    p7_11c: '11c. Вас будь-коли видворяли, виключали або депортували?',
    p7_11d: '11d. Ви будь-коли незаконно перебували в США після наказу про видворення?',
    p7_12a: '12a. Ви раніше подавали заяву на TPS?',
    p7_12b: '12b. Вам раніше надавали TPS?',
    p7_12c: '12c. Ваш попередній TPS було скасовано або відкликано?',
    p7_12d: '12d. Вашу попередню заяву на TPS було відхилено?',
    p7_13a: '13a. Ви будь-коли отримували державну допомогу шляхом шахрайства?',
    p7_13b: '13b. Ви будь-коли давали неправдиві показання для отримання федеральних пільг?',
    p7_13c: '13c. Ви будь-коли подавали підроблені документи для отримання державної допомоги?',
    p7_17: '17. Ви раніше подавали форму I-821?',
    p7_18a: '18a. Ви зараз перебуваєте у провадженні імміграційного суду?',
    p7_18b: '18b. Суддя з питань імміграції виніс рішення про ваше видворення?',
    p7_18c: '18c. Ви подавали апеляцію до Апеляційної ради з питань імміграції (BIA)?',
    passport: 'Номер паспорта', passportCountry: 'Країна видачі паспорта', passportExp: 'Паспорт дійсний до',
    passportExpHint: 'Якщо в цьому документі немає строку дії, перевірте закордонний паспорт або введіть значення вручну, якщо воно відоме.',
    street: 'Адреса в США (вулиця, номер будинку)', city: 'Місто', state: 'Штат (2 літери, напр. CA)', zip: 'ZIP-код',
    mailingDifferentLabel: 'Адреса для листування відрізняється від фізичної',
    mailingStreet: 'Адреса для листування (вулиця)', mailingCity: 'Місто (листування)', mailingState: 'Штат (листування)', mailingZip: 'ZIP (листування)',
    i94: 'I-94 admission number (11 цифр)', entry: 'Дата останнього в\'їзду в США',
    phone: 'Денний телефон', email: 'Email',
    generate: 'Згенерувати PDF-пакет (чернетка)',
    attestation: 'Я ознайомився з даними вище. Я розумію, що Messenginfo не подає документи за мене і не є юридичною фірмою.',
    attestRequired: 'Поставте галочку, щоб згенерувати пакет.',
    generating: 'Генерую…',
    successHeader: 'Готово. Що далі?',
    success: 'PDF з вашими даними готові. Тепер уважно перевірте і відправте до USCIS самостійно.',
    download: 'Завантажити ZIP',
    again: 'Згенерувати ще раз',
    clearData: 'Стерти мої дані з браузера',
    clearDataHint: 'Видаляє все, що ви ввели, з цього пристрою. Згенерований ZIP залишиться у вас.',
    clearDataDone: 'Стерто. Дані більше не зберігаються тут.',
    errorHeader: 'Не вдалося згенерувати.',
    missing: 'Незаповнені поля:',
    legal: 'Це чернетка. Messenginfo не подає документи в USCIS і не дає юридичних порад. Уважно перевіряйте все перед відправкою.',
    state_placeholder: 'CA',

    nsZip: 'Що всередині ZIP-архіву',
    nsZipI821: 'I-821.pdf — заява на TPS (13 сторінок).',
    nsZipI765: 'I-765.pdf — заява на дозвіл на роботу (7 сторінок), якщо ви її обрали.',
    nsZipReadme: 'README.txt — короткий путівник.',
    nsSign: 'Де поставити підпис (роздруковані форми — тільки при поданні поштою)',
    nsSignI821: 'I-821 — Частина 8 на сторінці 10. Підпишіть і поставте дату.',
    nsSignI765: 'I-765 — Частина 3 на сторінці 4. Підпишіть і поставте дату.',
    nsSignPenWarning: '⚠ ПІДПИС від руки — обов\'язково на роздрукованих формах при поданні поштою! (FR 2026-09289, з 10.07.2026): USCIS може ВІДХИЛИТИ заяву та УТРИМАТИ збір за недійсний підпис на I-821/I-765 (скан/фото, надрукований текст, програмний). До перекладів документів це правило не стосується. Підписуйте вручну чорною або синьою ручкою.',
    nsPrint: 'Як друкувати',
    nsPrintLines: 'Одностороння печать (single-sided). Без масштабування (100%, без "fit to page"). Папір A4 або US Letter.',
    nsEnvelope: 'Що покласти в конверт',
    nsEnvelopeI821: 'Заповнений і підписаний I-821.',
    nsEnvelopeI765: 'Заповнений і підписаний I-765 (якщо подаєте EAD).',
    nsEnvelopeFee: 'Чек/мані-ордер за держзбір USCIS — або I-912 (якщо просите звільнення).',
    nsEnvelopeEvidence: 'Копії доказів проживання (НЕ оригінали).',
    nsEnvelopePassport: 'Копія сторінки паспорта (НЕ оригінал).',
    nsAddress: 'Куди надіслати',
    nsAddressBody: 'USCIS приймає TPS у спеціальних адресах "Lockbox". Адреса залежить від вашого штату. Точну адресу для I-821 і I-765 завжди перевіряйте на офіційних сторінках USCIS:',
    nsAddressI821Link: 'Адреси для I-821 →',
    nsAddressI765Link: 'Адреси для I-765 →',
    nsOnline: 'Або подайте онлайн',
    nsOnlineBody: 'I-821 та I-765 (категорія TPS) можна подати онлайн через ваш USCIS-акаунт. Це швидше і дозволяє платити карткою. Але онлайн-подання НЕ підтримує I-912 (звільнення від оплати) — у цьому випадку лише папір.',
    nsOnlineLink: 'Зайти в my.uscis.gov →',
    nsSourcesTitle: 'Офіційні джерела USCIS',
    nsSourceTpsPage: 'TPS Ukraine — країнова сторінка USCIS',
    nsSourceI821: 'Форма I-821 (USCIS)',
    nsSourceI765: 'Форма I-765 (USCIS)',
    nsSourceTpsGeneral: 'TPS — загальні вимоги і докази',
  },
  ru: {
    toggleOpen: '↓ Заполнить готовый PDF-пакет (черновик)',
    toggleClose: '✕ Закрыть',
    heading: 'Заполнить готовые I-821 + I-765 (черновик)',
    intro: 'Введите данные, которые USCIS спрашивает в форме. Мы сгенерируем PDF с вашими ответами уже в клетках. Распечатаете, подпишете и подаёте сами.',
    family: 'Фамилия (Family Name)', given: 'Имя (Given Name)', middle: 'Отчество (Middle Name) — необязательно',
    dob: 'Дата рождения', sex: 'Пол', male: 'Мужской', female: 'Женский',
    cityob: 'Город рождения', cob: 'Страна рождения',
    ssn: 'SSN (9 цифр, без дефисов) — если есть',
    aNumber: 'A-Number (9 цифр без буквы A) — если есть',
    statusEntry: 'Статус на момент последнего въезда (напр. "UH", "Parole", "B-2")',
    maritalStatus: 'Семейное положение (обязательно)',
    ms_single: 'Никогда не состоял/а в браке', ms_married: 'Женат/Замужем',
    ms_divorced: 'Разведён/Разведена', ms_widowed: 'Вдовец/Вдова',
    ms_separated: 'Юридически разлучён/а', ms_annulled: 'Брак аннулирован', ms_other: 'Другое',
    i765type: 'Тип заявления I-765 (разрешение на работу)',
    i765_initial: 'Первоначальное разрешение', i765_renewal: 'Продление', i765_replacement: 'Замена карточки',
    bioHeading: 'Биографические данные (Part 3 I-821)',
    ethnicity: 'Этническая принадлежность', eth_hispanic: 'Испано-/латиноамериканского происхождения', eth_not: 'Не испаноязычного происхождения',
    eyeColor: 'Цвет глаз', hairColor: 'Цвет волос',
    eye_black: 'Чёрный', eye_blue: 'Голубой', eye_brown: 'Карий', eye_gray: 'Серый', eye_green: 'Зелёный', eye_hazel: 'Ореховый', eye_maroon: 'Тёмно-каштановый', eye_pink: 'Розовый', eye_unknown: 'Неизвестный',
    hair_bald: 'Лысый', hair_black: 'Чёрные', hair_blonde: 'Русые/Светлые', hair_brown: 'Каштановые', hair_gray: 'Седые', hair_red: 'Рыжие', hair_sandy: 'Песочные', hair_white: 'Белые/Седые', hair_unknown: 'Неизвестный',
    race: 'Раса (можно несколько)',
    race_white: 'Белая раса', race_asian: 'Азиатская', race_black: 'Чёрная / афроамериканская', race_ai: 'Коренные американцы / Аляска', race_pi: 'Острова Тихого океана',
    part7Heading: '⚠ Декларация о прошлом (Part 7 I-821) — обязательно проверьте',
    part7Intro: 'USCIS требует ответов на все вопросы ниже. Мы поставили "Нет" по умолчанию — это ответ для подавляющего большинства заявителей. Если какой-либо ответ "Да" для вас — измените его. Прочитайте каждый вопрос перед подписью.',
    part7Confirm: 'Я прочитал/а каждый вопрос и подтверждаю, что ответы правильные.',
    part7ConfirmRequired: 'Необходимо подтвердить проверку Part 7 перед генерацией.',
    part7AttorneyWarning: '⚠ Вы ответили "Да" на один или несколько вопросов. Рекомендуем проконсультироваться с лицензированным иммиграционным адвокатом или аккредитованным представителем DOJ перед подачей.',
    p7_4a: '4a. Вы когда-либо совершали преступление любого рода (включая те, за которые вас не арестовывали)?',
    p7_4b: '4b. Вас когда-либо арестовывали, предъявляли обвинения или задерживали?',
    p7_4c: '4c. Вас когда-либо осуждали за преступление?',
    p7_5a: '5a. Вас когда-либо арестовывали или штрафовали за вождение в нетрезвом состоянии?',
    p7_5b: '5b. Вы когда-либо управляли транспортным средством в нетрезвом состоянии без ареста?',
    p7_5c: '5c. Вас когда-либо осуждали за вождение в нетрезвом состоянии?',
    p7_7a: '7a. Вы когда-либо приказывали, подстрекали или совершали акты пыток, геноцида или массового насилия?',
    p7_7b: '7b. Вы когда-либо участвовали в преследовании какого-либо лица?',
    p7_7c: '7c. Вы являетесь членом/офицером военного, военизированного или полицейского подразделения, совершавшего злоупотребления?',
    p7_8: '8. Вас когда-либо осуждали за домашнее насилие, преследование или нарушение охранного ордера?',
    p7_9a: '9a. Вы когда-либо искажали факты для получения иммиграционной льготы?',
    p7_9b: '9b. Вы когда-либо ложно заявляли о гражданстве США?',
    p7_9c: '9c. Вы когда-либо получали или использовали поддельный паспорт США?',
    p7_9d: '9d. Вы когда-либо подавали поддельные документы в федеральный/государственный орган?',
    p7_9e: '9e. Вы когда-либо практиковали незаконную полигамию?',
    p7_11a: '11a. В отношении вас когда-либо возбуждали дело о депортации/высылке?',
    p7_11b: '11b. Судья когда-либо выносил окончательное решение о вашей депортации/высылке?',
    p7_11c: '11c. Вас когда-либо депортировали, высылали или исключали?',
    p7_11d: '11d. Вы когда-либо незаконно находились в США после приказа о депортации?',
    p7_12a: '12a. Вы ранее подавали заявление на TPS?',
    p7_12b: '12b. Вам ранее предоставляли TPS?',
    p7_12c: '12c. Ваш предыдущий TPS был отменён или отозван?',
    p7_12d: '12d. Ваше предыдущее заявление на TPS было отклонено?',
    p7_13a: '13a. Вы когда-либо получали государственную помощь путём мошенничества?',
    p7_13b: '13b. Вы когда-либо давали ложные показания для получения федеральных льгот?',
    p7_13c: '13c. Вы когда-либо подавали поддельные документы для получения государственной помощи?',
    p7_17: '17. Вы ранее подавали форму I-821?',
    p7_18a: '18a. Вы сейчас находитесь в производстве иммиграционного суда?',
    p7_18b: '18b. Судья по делам об иммиграции вынес решение о вашей депортации?',
    p7_18c: '18c. Вы подавали апелляцию в Апелляционный совет по вопросам иммиграции (BIA)?',
    passport: 'Номер паспорта', passportCountry: 'Страна выдачи паспорта', passportExp: 'Паспорт действителен до',
    passportExpHint: 'Если в документе нет срока действия, проверьте ваш загранпаспорт или введите данные вручную, если они известны.',
    street: 'Адрес в США (улица, номер дома)', city: 'Город', state: 'Штат (2 буквы, напр. CA)', zip: 'ZIP-код',
    mailingDifferentLabel: 'Адрес для корреспонденции отличается от физического',
    mailingStreet: 'Адрес для корреспонденции (улица)', mailingCity: 'Город (корреспонденция)', mailingState: 'Штат (корреспонденция)', mailingZip: 'ZIP (корреспонденция)',
    i94: 'I-94 admission number (11 цифр)', entry: 'Дата последнего въезда в США',
    phone: 'Дневной телефон', email: 'Email',
    generate: 'Сгенерировать PDF-пакет (черновик)',
    attestation: 'Я ознакомился с данными выше. Я понимаю, что Messenginfo не подаёт документы за меня и не является юридической фирмой.',
    attestRequired: 'Поставьте галочку, чтобы сгенерировать пакет.',
    generating: 'Генерирую…',
    successHeader: 'Готово. Что дальше?',
    success: 'PDF с вашими данными готовы. Теперь внимательно проверьте и отправьте в USCIS самостоятельно.',
    download: 'Скачать ZIP',
    again: 'Сгенерировать ещё раз',
    clearData: 'Стереть мои данные из браузера',
    clearDataHint: 'Удаляет всё, что вы ввели, с этого устройства. Скачанный ZIP останется у вас.',
    clearDataDone: 'Стёрто. Данные больше не хранятся здесь.',
    errorHeader: 'Не удалось сгенерировать.',
    missing: 'Незаполненные поля:',
    legal: 'Это черновик. Messenginfo не подаёт документы в USCIS и не даёт юридических советов. Внимательно проверяйте всё перед отправкой.',
    state_placeholder: 'CA',

    nsZip: 'Что внутри ZIP-архива',
    nsZipI821: 'I-821.pdf — заявление на TPS (13 страниц).',
    nsZipI765: 'I-765.pdf — заявление на разрешение на работу (7 страниц), если вы его выбрали.',
    nsZipReadme: 'README.txt — короткий путеводитель.',
    nsSign: 'Где поставить подпись (распечатанные формы — только при подаче по почте)',
    nsSignI821: 'I-821 — Часть 8 на странице 10. Подпишите и поставьте дату.',
    nsSignI765: 'I-765 — Часть 3 на странице 4. Подпишите и поставьте дату.',
    nsSignPenWarning: '⚠ ПОДПИСЬ от руки — обязательно на распечатанных формах при подаче по почте! (FR 2026-09289, с 10.07.2026): USCIS может ОТКЛОНИТЬ заявление и УДЕРЖАТЬ сбор за недействительную подпись на I-821/I-765 (скан/фото, напечатанный текст, программный). К переводам документов это правило не относится. Подписывайте вручную чёрной или синей ручкой.',
    nsPrint: 'Как печатать',
    nsPrintLines: 'Односторонняя печать (single-sided). Без масштабирования (100%, без "fit to page"). Бумага A4 или US Letter.',
    nsEnvelope: 'Что положить в конверт',
    nsEnvelopeI821: 'Заполненный и подписанный I-821.',
    nsEnvelopeI765: 'Заполненный и подписанный I-765 (если подаёте на EAD).',
    nsEnvelopeFee: 'Чек/мани-ордер за госпошлину USCIS — или I-912 (если просите освобождение от оплаты).',
    nsEnvelopeEvidence: 'Копии доказательств проживания (НЕ оригиналы).',
    nsEnvelopePassport: 'Копия страницы паспорта (НЕ оригинал).',
    nsAddress: 'Куда отправлять',
    nsAddressBody: 'USCIS принимает TPS по специальным адресам "Lockbox". Адрес зависит от вашего штата. Точный адрес для I-821 и I-765 всегда проверяйте на официальных страницах USCIS:',
    nsAddressI821Link: 'Адреса для I-821 →',
    nsAddressI765Link: 'Адреса для I-765 →',
    nsOnline: 'Или подайте онлайн',
    nsOnlineBody: 'I-821 и I-765 (категория TPS) можно подать онлайн через ваш USCIS-аккаунт. Это быстрее и позволяет платить картой. Но онлайн-подача НЕ поддерживает I-912 (освобождение от оплаты) — в этом случае только бумага.',
    nsOnlineLink: 'Зайти в my.uscis.gov →',
    nsSourcesTitle: 'Официальные источники USCIS',
    nsSourceTpsPage: 'TPS Ukraine — страновая страница USCIS',
    nsSourceI821: 'Форма I-821 (USCIS)',
    nsSourceI765: 'Форма I-765 (USCIS)',
    nsSourceTpsGeneral: 'TPS — общие требования и доказательства',
  },
  en: {
    toggleOpen: '↓ Fill the PDF packet (draft)',
    toggleClose: '✕ Close',
    heading: 'Fill the ready I-821 + I-765 (draft)',
    intro: 'Enter the data USCIS asks for on the form. We generate PDFs with your answers already in the boxes. You then print, sign, and mail them yourself.',
    family: 'Family Name', given: 'Given Name', middle: 'Middle Name — optional',
    dob: 'Date of birth', sex: 'Sex', male: 'Male', female: 'Female',
    cityob: 'City of birth', cob: 'Country of birth',
    ssn: 'SSN (9 digits, no dashes) — if you have one',
    aNumber: 'A-Number (9 digits, no letter A) — if you have one',
    statusEntry: 'Immigration status at last entry (e.g. "UH", "Parole", "B-2")',
    maritalStatus: 'Marital status (required)',
    ms_single: 'Single (never married)', ms_married: 'Married',
    ms_divorced: 'Divorced', ms_widowed: 'Widowed',
    ms_separated: 'Legally separated', ms_annulled: 'Annulled marriage', ms_other: 'Other',
    i765type: 'I-765 application type (work permit)',
    i765_initial: 'Initial permission', i765_renewal: 'Renewal', i765_replacement: 'Replacement card',
    bioHeading: 'Biographic information (Part 3 of I-821)',
    ethnicity: 'Ethnicity', eth_hispanic: 'Hispanic or Latino', eth_not: 'Not Hispanic or Latino',
    eyeColor: 'Eye color', hairColor: 'Hair color',
    eye_black: 'Black', eye_blue: 'Blue', eye_brown: 'Brown', eye_gray: 'Gray', eye_green: 'Green', eye_hazel: 'Hazel', eye_maroon: 'Maroon', eye_pink: 'Pink', eye_unknown: 'Unknown',
    hair_bald: 'Bald', hair_black: 'Black', hair_blonde: 'Blonde', hair_brown: 'Brown', hair_gray: 'Gray', hair_red: 'Red', hair_sandy: 'Sandy', hair_white: 'White', hair_unknown: 'Unknown',
    race: 'Race (select all that apply)',
    race_white: 'White', race_asian: 'Asian', race_black: 'Black or African American', race_ai: 'American Indian / Alaska Native', race_pi: 'Native Hawaiian / Pacific Islander',
    part7Heading: '⚠ Background Declaration (Part 7 of I-821) — review required',
    part7Intro: 'USCIS requires answers to all questions below. We defaulted all to "No" — correct for most TPS Ukraine applicants. If any answer is "Yes" for you, toggle it. You must read each question before signing.',
    part7Confirm: 'I have read each question and confirm my answers are accurate.',
    part7ConfirmRequired: 'You must confirm the Part 7 review before generating the packet.',
    part7AttorneyWarning: '⚠ You answered "Yes" to one or more questions. We recommend consulting a licensed immigration attorney or DOJ-accredited representative before filing.',
    p7_4a: '4a. Have you EVER committed a crime of any kind, including crimes for which you were not arrested?',
    p7_4b: '4b. Have you EVER been arrested, charged, cited, or detained by any law enforcement officer?',
    p7_4c: '4c. Have you EVER been convicted of any crime?',
    p7_5a: '5a. Have you EVER been arrested or cited for driving under the influence?',
    p7_5b: '5b. Have you EVER driven a vehicle under the influence of alcohol or drugs without being arrested?',
    p7_5c: '5c. Have you EVER been convicted of driving under the influence?',
    p7_7a: '7a. Have you EVER ordered, incited, called for, committed, or assisted acts of torture or genocide?',
    p7_7b: '7b. Have you EVER engaged or assisted in the persecution of any person?',
    p7_7c: '7c. Are you a member or officer of any military, paramilitary, or police unit that has engaged in abuses?',
    p7_8: '8. Have you EVER been convicted of domestic violence, stalking, or violating a protective order?',
    p7_9a: '9a. Have you EVER misrepresented facts to obtain an immigration benefit?',
    p7_9b: '9b. Have you EVER falsely claimed U.S. citizenship?',
    p7_9c: '9c. Have you EVER obtained or used a false U.S. passport?',
    p7_9d: '9d. Have you EVER submitted false documents to a federal, state, or local authority?',
    p7_9e: '9e. Have you EVER practiced unlawful polygamy?',
    p7_11a: '11a. Have you EVER been placed in removal, deportation, or exclusion proceedings?',
    p7_11b: '11b. Has an immigration judge ever issued a final order of removal, deportation, or exclusion against you?',
    p7_11c: '11c. Have you EVER been removed, deported, or excluded from the United States?',
    p7_11d: '11d. Have you EVER remained in the U.S. unlawfully after a removal order?',
    p7_12a: '12a. Have you previously applied for TPS?',
    p7_12b: '12b. Were you previously granted TPS?',
    p7_12c: '12c. Was your previous TPS terminated or withdrawn?',
    p7_12d: '12d. Was your previous TPS application denied?',
    p7_13a: '13a. Have you EVER obtained a public benefit by fraud?',
    p7_13b: '13b. Have you EVER made a false representation to obtain a federal benefit?',
    p7_13c: '13c. Have you EVER submitted false documents to obtain a public benefit?',
    p7_17: '17. Have you previously filed Form I-821?',
    p7_18a: '18a. Are you currently in immigration court proceedings?',
    p7_18b: '18b. Has an immigration judge ordered your removal?',
    p7_18c: '18c. Have you filed an appeal with the Board of Immigration Appeals (BIA)?',
    passport: 'Passport number', passportCountry: 'Country that issued passport', passportExp: 'Passport expires',
    passportExpHint: 'If this document does not show an expiration date, use your international passport or enter the value manually if known.',
    street: 'US address (street, house number)', city: 'City', state: 'State (2 letters, e.g. CA)', zip: 'ZIP code',
    mailingDifferentLabel: 'My mailing address is different from my physical address',
    mailingStreet: 'Mailing address (street)', mailingCity: 'Mailing city', mailingState: 'Mailing state', mailingZip: 'Mailing ZIP',
    i94: 'I-94 admission number (11 digits)', entry: 'Date of your last entry to the US',
    phone: 'Daytime phone', email: 'Email',
    generate: 'Generate PDF packet (draft)',
    attestation: 'I have reviewed the information above. I understand Messenginfo does not file documents on my behalf and is not a law firm.',
    attestRequired: 'Check the box to enable packet generation.',
    generating: 'Generating…',
    successHeader: 'Done. What next?',
    success: 'Your PDFs are ready. Review them carefully and then mail or upload to USCIS yourself.',
    download: 'Download ZIP',
    again: 'Generate again',
    clearData: 'Clear my data from this browser',
    clearDataHint: 'Removes everything you typed from this device. The ZIP you downloaded stays with you.',
    clearDataDone: 'Cleared. Your data is no longer stored here.',
    errorHeader: 'Could not generate.',
    missing: 'Missing fields:',
    legal: 'This is a draft. Messenginfo does not file documents with USCIS and does not provide legal advice. Review everything carefully before mailing.',
    state_placeholder: 'CA',

    nsZip: 'What is inside the ZIP',
    nsZipI821: 'I-821.pdf — TPS application (13 pages).',
    nsZipI765: 'I-765.pdf — work permit application (7 pages), if you requested one.',
    nsZipReadme: 'README.txt — short guide.',
    nsSign: 'Where to sign (printed forms — mail filing only)',
    nsSignI821: 'I-821 — Part 8 on page 10. Sign and date.',
    nsSignI765: 'I-765 — Part 3 on page 4. Sign and date.',
    nsSignPenWarning: '⚠ HANDWRITTEN signature required — on the printed forms you mail! (FR doc 2026-09289, effective July 10, 2026): USCIS may DENY your application and KEEP your filing fee for an invalid signature on I-821/I-765 (scanned image, typed name, software-generated). This rule does not apply to document translations. Sign BY HAND in black or blue ink.',
    nsPrint: 'How to print',
    nsPrintLines: 'Single-sided. No scaling (100%, NOT "fit to page"). A4 or US Letter paper.',
    nsEnvelope: 'What to put in the envelope',
    nsEnvelopeI821: 'Filled and signed I-821.',
    nsEnvelopeI765: 'Filled and signed I-765 (if filing for EAD).',
    nsEnvelopeFee: 'Check or money order for the USCIS fee — or I-912 (if requesting a fee waiver).',
    nsEnvelopeEvidence: 'Copies of residence evidence (NOT originals).',
    nsEnvelopePassport: 'Copy of your passport page (NOT the original).',
    nsAddress: 'Where to mail',
    nsAddressBody: 'USCIS accepts TPS at special "Lockbox" addresses. The address depends on your state. Always check the official USCIS filing-addresses pages for I-821 and I-765:',
    nsAddressI821Link: 'I-821 mailing addresses →',
    nsAddressI765Link: 'I-765 mailing addresses →',
    nsOnline: 'Or file online',
    nsOnlineBody: 'I-821 and I-765 (TPS category) can be filed online through your USCIS account. Online is faster and lets you pay by card. But online filing does NOT support I-912 (fee waiver) — paper only in that case.',
    nsOnlineLink: 'Go to my.uscis.gov →',
    nsSourcesTitle: 'Official USCIS sources',
    nsSourceTpsPage: 'TPS Ukraine — USCIS country page',
    nsSourceI821: 'Form I-821 (USCIS)',
    nsSourceI765: 'Form I-765 (USCIS)',
    nsSourceTpsGeneral: 'TPS — general requirements and evidence',
  },
  es: {
    toggleOpen: '↓ Llenar el paquete PDF (borrador)',
    toggleClose: '✕ Cerrar',
    heading: 'Llenar I-821 + I-765 (borrador)',
    intro: 'Ingrese los datos que USCIS pide en el formulario. Generamos PDFs con sus respuestas ya en las casillas. Usted imprime, firma y envía.',
    family: 'Apellido (Family Name)', given: 'Nombre (Given Name)', middle: 'Segundo nombre — opcional',
    dob: 'Fecha de nacimiento', sex: 'Sexo', male: 'Masculino', female: 'Femenino',
    cityob: 'Ciudad de nacimiento', cob: 'País de nacimiento',
    ssn: 'SSN (9 dígitos, sin guiones) — si tiene uno',
    aNumber: 'A-Number (9 dígitos sin letra A) — si tiene uno',
    statusEntry: 'Estado migratorio al último ingreso (p.ej. "UH", "Parole", "B-2")',
    maritalStatus: 'Estado civil (obligatorio)',
    ms_single: 'Soltero/a (nunca casado/a)', ms_married: 'Casado/a',
    ms_divorced: 'Divorciado/a', ms_widowed: 'Viudo/a',
    ms_separated: 'Separado/a legalmente', ms_annulled: 'Matrimonio anulado', ms_other: 'Otro',
    i765type: 'Tipo de solicitud I-765 (permiso de trabajo)',
    i765_initial: 'Permiso inicial', i765_renewal: 'Renovación', i765_replacement: 'Reemplazo de tarjeta',
    bioHeading: 'Datos biográficos (Parte 3 del I-821)',
    ethnicity: 'Etnia', eth_hispanic: 'Hispano o latino', eth_not: 'No hispano ni latino',
    eyeColor: 'Color de ojos', hairColor: 'Color de cabello',
    eye_black: 'Negro', eye_blue: 'Azul', eye_brown: 'Café', eye_gray: 'Gris', eye_green: 'Verde', eye_hazel: 'Avellana', eye_maroon: 'Castaño oscuro', eye_pink: 'Rosa', eye_unknown: 'Desconocido',
    hair_bald: 'Calvo', hair_black: 'Negro', hair_blonde: 'Rubio', hair_brown: 'Castaño', hair_gray: 'Canoso', hair_red: 'Rojo', hair_sandy: 'Arena', hair_white: 'Blanco/Canoso', hair_unknown: 'Desconocido',
    race: 'Raza (seleccione todas las que correspondan)',
    race_white: 'Blanca', race_asian: 'Asiática', race_black: 'Negra o afroamericana', race_ai: 'Indio americano / Nativo de Alaska', race_pi: 'Nativo de Hawái / Islas del Pacífico',
    part7Heading: '⚠ Declaración de antecedentes (Parte 7 del I-821) — revisión obligatoria',
    part7Intro: 'USCIS requiere respuestas a todas las preguntas. Las hemos marcado "No" por defecto — correcto para la mayoría de solicitantes de TPS Ucrania. Si alguna respuesta es "Sí" para usted, cámbiela. Debe leer cada pregunta antes de firmar.',
    part7Confirm: 'He leído cada pregunta y confirmo que mis respuestas son correctas.',
    part7ConfirmRequired: 'Debe confirmar la revisión de la Parte 7 antes de generar el paquete.',
    part7AttorneyWarning: '⚠ Ha respondido "Sí" a una o más preguntas. Recomendamos consultar con un abogado de inmigración autorizado o representante acreditado del DOJ antes de presentar.',
    p7_4a: '4a. ¿Ha cometido ALGUNA VEZ un delito de cualquier tipo, incluyendo delitos por los que no fue arrestado/a?',
    p7_4b: '4b. ¿Ha sido ALGUNA VEZ arrestado/a, acusado/a, citado/a o detenido/a por algún agente del orden?',
    p7_4c: '4c. ¿Ha sido ALGUNA VEZ condenado/a por algún delito?',
    p7_5a: '5a. ¿Ha sido ALGUNA VEZ arrestado/a o citado/a por conducir bajo la influencia?',
    p7_5b: '5b. ¿Ha conducido ALGUNA VEZ un vehículo bajo la influencia sin ser arrestado/a?',
    p7_5c: '5c. ¿Ha sido ALGUNA VEZ condenado/a por conducir bajo la influencia?',
    p7_7a: '7a. ¿Ha ordenado, incitado, cometido o asistido ALGUNA VEZ actos de tortura o genocidio?',
    p7_7b: '7b. ¿Ha participado ALGUNA VEZ en la persecución de alguna persona?',
    p7_7c: '7c. ¿Es miembro u oficial de alguna unidad militar, paramilitar o policial que haya cometido abusos?',
    p7_8: '8. ¿Ha sido condenado/a ALGUNA VEZ por violencia doméstica, acoso o violación de una orden de protección?',
    p7_9a: '9a. ¿Ha tergiversado ALGUNA VEZ hechos para obtener un beneficio migratorio?',
    p7_9b: '9b. ¿Ha reclamado ALGUNA VEZ falsamente la ciudadanía estadounidense?',
    p7_9c: '9c. ¿Ha obtenido o usado ALGUNA VEZ un pasaporte estadounidense falso?',
    p7_9d: '9d. ¿Ha presentado ALGUNA VEZ documentos falsos ante una autoridad federal, estatal o local?',
    p7_9e: '9e. ¿Ha practicado ALGUNA VEZ poligamia ilegal?',
    p7_11a: '11a. ¿Ha sido puesto/a ALGUNA VEZ en procedimientos de remoción, deportación o exclusión?',
    p7_11b: '11b. ¿Ha emitido ALGUNA VEZ un juez de inmigración una orden final de remoción o exclusión en su contra?',
    p7_11c: '11c. ¿Ha sido ALGUNA VEZ removido/a, deportado/a o excluido/a de los EE.UU.?',
    p7_11d: '11d. ¿Ha permanecido ALGUNA VEZ ilegalmente en EE.UU. después de una orden de remoción?',
    p7_12a: '12a. ¿Ha solicitado TPS anteriormente?',
    p7_12b: '12b. ¿Se le otorgó TPS anteriormente?',
    p7_12c: '12c. ¿Fue terminado o retirado su TPS anterior?',
    p7_12d: '12d. ¿Fue denegada su solicitud de TPS anterior?',
    p7_13a: '13a. ¿Ha obtenido ALGUNA VEZ un beneficio público mediante fraude?',
    p7_13b: '13b. ¿Ha realizado ALGUNA VEZ una declaración falsa para obtener un beneficio federal?',
    p7_13c: '13c. ¿Ha presentado ALGUNA VEZ documentos falsos para obtener un beneficio público?',
    p7_17: '17. ¿Ha presentado anteriormente el Formulario I-821?',
    p7_18a: '18a. ¿Se encuentra actualmente en proceso ante un tribunal de inmigración?',
    p7_18b: '18b. ¿Ha ordenado un juez de inmigración su remoción?',
    p7_18c: '18c. ¿Ha presentado una apelación ante la Junta de Apelaciones de Inmigración (BIA)?',
    passport: 'Número de pasaporte', passportCountry: 'País emisor del pasaporte', passportExp: 'Pasaporte vence',
    passportExpHint: 'Si este documento no muestra fecha de vencimiento, use su pasaporte internacional o ingrésela manualmente si la conoce.',
    street: 'Dirección en EE.UU. (calle, número)', city: 'Ciudad', state: 'Estado (2 letras, ej. CA)', zip: 'Código ZIP',
    mailingDifferentLabel: 'Mi dirección postal es diferente a la física',
    mailingStreet: 'Dirección postal (calle)', mailingCity: 'Ciudad (postal)', mailingState: 'Estado (postal)', mailingZip: 'ZIP (postal)',
    i94: 'I-94 admission number (11 dígitos)', entry: 'Fecha de su última entrada a EE.UU.',
    phone: 'Teléfono diurno', email: 'Email',
    generate: 'Generar paquete PDF (borrador)',
    attestation: 'He revisado la información anterior. Entiendo que Messenginfo no presenta documentos por mí y no es un bufete de abogados.',
    attestRequired: 'Marque la casilla para habilitar la generación del paquete.',
    generating: 'Generando…',
    successHeader: 'Listo. ¿Qué sigue?',
    success: 'Sus PDFs están listos. Revíselos cuidadosamente y luego envíelos o cárguelos en USCIS usted mismo.',
    download: 'Descargar ZIP',
    again: 'Generar otra vez',
    clearData: 'Borrar mis datos de este navegador',
    clearDataHint: 'Elimina todo lo que escribió de este dispositivo. El ZIP que descargó queda con usted.',
    clearDataDone: 'Borrado. Sus datos ya no se guardan aquí.',
    errorHeader: 'No se pudo generar.',
    missing: 'Campos faltantes:',
    legal: 'Esto es un borrador. Messenginfo no presenta documentos ante USCIS ni brinda asesoría legal. Revise todo cuidadosamente antes de enviar.',
    state_placeholder: 'CA',

    nsZip: 'Qué hay dentro del ZIP',
    nsZipI821: 'I-821.pdf — solicitud de TPS (13 páginas).',
    nsZipI765: 'I-765.pdf — solicitud de permiso de trabajo (7 páginas), si la solicitó.',
    nsZipReadme: 'README.txt — guía corta.',
    nsSign: 'Dónde firmar (formularios impresos — solo para envío por correo)',
    nsSignI821: 'I-821 — Parte 8 en la página 10. Firme y ponga la fecha.',
    nsSignI765: 'I-765 — Parte 3 en la página 4. Firme y ponga la fecha.',
    nsSignPenWarning: '⚠ Firma MANUSCRITA obligatoria — en los formularios impresos que enviará por correo (FR doc 2026-09289, vigente 10 jul 2026): USCIS puede DENEGAR la solicitud y RETENER la tarifa por firma inválida en I-821/I-765 (imagen escaneada, nombre escrito, software). Esta regla no aplica a traducciones de documentos. Firme A MANO con tinta azul o negra.',
    nsPrint: 'Cómo imprimir',
    nsPrintLines: 'Una cara (single-sided). Sin escalado (100%, NO "ajustar a página"). Papel A4 o US Letter.',
    nsEnvelope: 'Qué poner en el sobre',
    nsEnvelopeI821: 'I-821 llenado y firmado.',
    nsEnvelopeI765: 'I-765 llenado y firmado (si solicita EAD).',
    nsEnvelopeFee: 'Cheque o money order por la tarifa de USCIS — o I-912 (si solicita exención de pago).',
    nsEnvelopeEvidence: 'Copias de evidencias de residencia (NO originales).',
    nsEnvelopePassport: 'Copia de la página del pasaporte (NO el original).',
    nsAddress: 'A dónde enviar',
    nsAddressBody: 'USCIS recibe TPS en direcciones "Lockbox" especiales. La dirección depende de su estado. Siempre confirme la dirección oficial de USCIS para I-821 e I-765:',
    nsAddressI821Link: 'Direcciones para I-821 →',
    nsAddressI765Link: 'Direcciones para I-765 →',
    nsOnline: 'O presente en línea',
    nsOnlineBody: 'I-821 e I-765 (categoría TPS) se pueden presentar en línea a través de su cuenta de USCIS. En línea es más rápido y permite pagar con tarjeta. Pero la presentación en línea NO admite I-912 (exención de tarifa) — solo papel en ese caso.',
    nsOnlineLink: 'Ir a my.uscis.gov →',
    nsSourcesTitle: 'Fuentes oficiales de USCIS',
    nsSourceTpsPage: 'TPS Ucrania — página del país de USCIS',
    nsSourceI821: 'Formulario I-821 (USCIS)',
    nsSourceI765: 'Formulario I-765 (USCIS)',
    nsSourceTpsGeneral: 'TPS — requisitos generales y evidencias',
  },
} as const

export default function GeneratePacketBlock({ locale, filingPath, wantsEad, preExtracted, knowledgeConflicts, knowledgeLowConfidence }: Props) {
  const c = COPY[locale]
  // Open by default. The block lives at the bottom of the final summary screen
  // and is the actual product — hiding it behind a toggle made senior users
  // miss it during UX testing.
  const [open, setOpen] = useState(true)
  const [fields, setFields] = useState<PersonalFields>(() => {
    let base: PersonalFields = EMPTY
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw) base = { ...EMPTY, ...(JSON.parse(raw) as Partial<PersonalFields>) }
      } catch { /* ignore */ }
    }
    return applyPreExtracted(base, preExtracted)
  })
  const [busy, setBusy] = useState(false)
  // TFR.6 — Attestation gate. Required by the agreed product plan so the
  // user explicitly acknowledges Messenginfo's scope (not a law firm,
  // doesn't file) before downloading a draft packet. Timestamp stored
  // in localStorage so a returning user doesn't have to re-attest within
  // the same session. NO PII captured.
  const [attestedAt, setAttestedAt] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem('tps:attest:v1')
      return raw ? parseInt(raw, 10) : null
    } catch { return null }
  })
  const setAttested = (v: boolean) => {
    const ts = v ? Date.now() : null
    setAttestedAt(ts)
    try {
      if (ts) window.localStorage.setItem('tps:attest:v1', String(ts))
      else window.localStorage.removeItem('tps:attest:v1')
    } catch { /* ignore */ }
  }
  const [zipUrl, setZipUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // B1.1 — Legal-risk flags. Persisted in localStorage so a returning
  // user does not have to re-answer; cleared by the SP-4 'Clear my data'
  // button below. NO PII — just three booleans.
  // Part 7 background declaration state — kept in a separate localStorage key
  // so it can be reset independently and doesn't inflate the personal-fields blob.
  const [part7, setPart7] = useState<Part7State>(() => {
    if (typeof window === 'undefined') return EMPTY_PART7
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_PART7)
      return raw ? { ...EMPTY_PART7, ...(JSON.parse(raw) as Partial<Part7State>) } : EMPTY_PART7
    } catch { return EMPTY_PART7 }
  })

  const [legalRisk, setLegalRiskRaw] = useState<LegalRiskValue>(() => {
    if (typeof window === 'undefined') return EMPTY_LEGAL_RISK
    try {
      const raw = window.localStorage.getItem('tps:legal-risk:v1')
      if (!raw) return EMPTY_LEGAL_RISK
      const parsed = JSON.parse(raw) as Partial<LegalRiskValue>
      return {
        has_criminal_concern: parsed.has_criminal_concern ?? null,
        has_prior_tps_denial: parsed.has_prior_tps_denial ?? null,
        left_us_without_advance_parole:
          parsed.left_us_without_advance_parole ?? null,
      }
    } catch {
      return EMPTY_LEGAL_RISK
    }
  })
  const setLegalRiskFlag = (key: keyof LegalRiskValue, val: boolean) => {
    setLegalRiskRaw((prev) => {
      const next = { ...prev, [key]: val }
      try {
        window.localStorage.setItem('tps:legal-risk:v1', JSON.stringify(next))
      } catch { /* ignore */ }
      return next
    })
  }

  // SP-4 mitigation (SECURITY_PRIVACY_AUDIT_TPS_V1): the user can wipe the
  // localStorage personal-fields key from their own browser after they've
  // downloaded the ZIP. Important on shared devices (refugee help centres,
  // family computers, library workstations).
  const [dataCleared, setDataCleared] = useState(false)
  const clearMyData = () => {
    if (isLedgerClientEnabled()) void clearServerDraft()
    try {
      window.localStorage.removeItem(STORAGE_KEY)
      window.localStorage.removeItem(STORAGE_KEY_PART7)
      window.localStorage.removeItem('wizard:tps-ukraine:state:v1')
      window.localStorage.removeItem('tps:attest:v1')
      window.localStorage.removeItem('tps:legal-risk:v1')
    } catch { /* ignore */ }
    setFields(EMPTY)
    setPart7(EMPTY_PART7)
    setAttestedAt(null)
    setLegalRiskRaw(EMPTY_LEGAL_RISK)
    setDataCleared(true)
  }

  // V1 #9 server-side ledger (default OFF). When NEXT_PUBLIC_SERVER_LEDGER_ENABLED=1,
  // PII (fields/part7) is stored encrypted server-side instead of localStorage; the
  // browser keeps only the opaque httpOnly token. Default-OFF path is byte-identical.
  const fieldsRef = useRef<PersonalFields>(fields)
  const part7Ref = useRef<Part7State>(part7)
  useEffect(() => {
    fieldsRef.current = fields
  }, [fields])
  useEffect(() => {
    part7Ref.current = part7
  }, [part7])
  useEffect(() => {
    if (!isLedgerClientEnabled()) return
    let alive = true
    void loadDraftFromServer<{ fields?: Partial<PersonalFields>; part7?: Partial<Part7State> }>().then((d) => {
      if (!alive || !d) return
      if (d.fields) {
        const f = applyPreExtracted({ ...EMPTY, ...d.fields }, preExtracted)
        fieldsRef.current = f
        setFields(f)
      }
      if (d.part7) {
        const p = { ...EMPTY_PART7, ...d.part7 }
        part7Ref.current = p
        setPart7(p)
      }
    })
    return () => {
      alive = false
    }
  }, [preExtracted])

  function update<K extends keyof PersonalFields>(k: K, v: PersonalFields[K]) {
    setFields((prev) => {
      const next = { ...prev, [k]: v }
      fieldsRef.current = next
      if (isLedgerClientEnabled()) {
        void saveDraftToServer('tps', { fields: next, part7: part7Ref.current })
      } else {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch { /* ignore */ }
      }
      return next
    })
  }

  function updatePart7<K extends keyof Part7State>(k: K, v: Part7State[K]) {
    setPart7((prev) => {
      const next = { ...prev, [k]: v }
      part7Ref.current = next
      if (isLedgerClientEnabled()) {
        void saveDraftToServer('tps', { fields: fieldsRef.current, part7: next })
      } else {
        try {
          window.localStorage.setItem(STORAGE_KEY_PART7, JSON.stringify(next))
        } catch { /* ignore */ }
      }
      return next
    })
  }

  async function generate() {
    setBusy(true)
    setMissing([])
    setError(null)
    setZipUrl(null)

    // ── Mail-ready gate: block export if critical data is missing/conflicted ──
    const gateResult = runMailReadyGate(
      fields as Partial<TPSAnswers>,
      knowledgeConflicts,
      knowledgeLowConfidence,
    )
    if (!gateResult.mail_ready) {
      const blockerLocale = (locale || 'en') as 'en' | 'ru' | 'uk'
      const blockerMessages = gateResult.blockers.map(b => 
        b.user_message[blockerLocale] || b.user_message.en
      )
      setMissing(blockerMessages)
      setBusy(false)
      return
    }

    const path = filingPath === 'initial' || filingPath === 're_registration'
      ? filingPath
      : 'initial'
    const body = {
      family_name: fields.family_name,
      given_name: fields.given_name,
      middle_name: fields.middle_name || undefined,
      dob: fields.dob,
      sex: fields.sex || 'M',
      country_of_birth: fields.country_of_birth,
      country_of_nationality: 'Ukraine',
      passport_number: fields.passport_number,
      passport_country_of_issuance: fields.passport_country_of_issuance,
      passport_expiration_date: fields.passport_expiration_date,
      us_address_street: fields.us_address_street,
      us_address_city: fields.us_address_city,
      us_address_state: fields.us_address_state.toUpperCase(),
      us_address_zip: fields.us_address_zip,
      mailing_same_as_physical: !fields.mailing_different,
      ...(fields.mailing_different ? {
        mailing_street: fields.mailing_street || undefined,
        mailing_city: fields.mailing_city || undefined,
        mailing_state: fields.mailing_state || undefined,
        mailing_zip: fields.mailing_zip || undefined,
      } : {}),
      last_entry_date: fields.last_entry_date,
      i94_admission_number: fields.i94_admission_number || undefined,
      // status_at_last_entry: OCR fills "UH" / "Parole" from I-94 class of
      // admission. If still blank for TPS-Ukraine path, default to "UH"
      // (Uniting for Ukraine), which is the actual class of admission USCIS
      // CBP uses for U4U parolees and the value real applicants must put on
      // I-765 Line 23. Empty string is allowed if the user truly entered on
      // a different basis (B-2, F-1, …) and OCR has not run yet.
      status_at_last_entry: fields.status_at_last_entry
        || (filingPath === 'initial' ? 'UH' : undefined),
      a_number: fields.a_number || undefined,
      city_of_birth: fields.city_of_birth || undefined,
      ssn: fields.ssn || undefined,
      // Civil status (I-821 Part 2 Item 17)
      marital_status: (fields.marital_status || undefined) as TPSAnswers['marital_status'],
      // I-765 application type (Part 1 checkboxes)
      i765_application_type: wantsEad === true
        ? ((fields.i765_application_type || (path === 'initial' ? 'initial' : 'renewal')) as 'initial' | 'replacement' | 'renewal')
        : undefined,
      // Part 3 biographic (I-821 Part 3)
      ethnicity: (fields.ethnicity || undefined) as TPSAnswers['ethnicity'],
      race_white: fields.race_white,
      race_asian: fields.race_asian,
      race_black: fields.race_black,
      race_american_indian: fields.race_american_indian,
      race_pacific_islander: fields.race_pacific_islander,
      eye_color: (fields.eye_color || undefined) as TPSAnswers['eye_color'],
      hair_color: (fields.hair_color || undefined) as TPSAnswers['hair_color'],
      filing_path: path,
      wants_ead: wantsEad === true,
      ead_category: wantsEad === true ? (path === 'initial' ? 'a12' : 'c19') : null,
      daytime_phone: fields.daytime_phone,
      email: fields.email,
      // B1.1 — Pass legal-risk flags through to the server. The flags are
      // INFORMATIONAL for now (server records but does not block). A future
      // pre-flight legal classifier can branch on these without a contract
      // change. `null` (user hasn't answered) is sent as `false` because the
      // TPSAnswers contract is strict-boolean — but the user-facing notice
      // only fires on explicit `true`.
      has_criminal_concern: legalRisk.has_criminal_concern === true,
      has_prior_tps_denial: legalRisk.has_prior_tps_denial === true,
      left_us_without_advance_parole:
        legalRisk.left_us_without_advance_parole === true,
      // Part 7 — background declaration (I-821 Pages 7-9)
      // Legal-risk quick flags are mapped into their corresponding Part 7
      // answers so PDF output reflects what the user answered in UI.
      part7_4a: part7.q4a || legalRisk.has_criminal_concern === true,
      part7_4b: part7.q4b,
      part7_4c: part7.q4c,
      part7_5a: part7.q5a, part7_5b: part7.q5b, part7_5c: part7.q5c,
      part7_7a: part7.q7a, part7_7b: part7.q7b, part7_7c: part7.q7c,
      part7_8: part7.q8,
      part7_9a: part7.q9a, part7_9b: part7.q9b, part7_9c: part7.q9c,
      part7_9d: part7.q9d, part7_9e: part7.q9e,
      part7_11a: part7.q11a, part7_11b: part7.q11b,
      part7_11c: part7.q11c,
      part7_11d: part7.q11d || legalRisk.left_us_without_advance_parole === true,
      part7_12a: part7.q12a, part7_12b: part7.q12b,
      part7_12c: part7.q12c,
      part7_12d: part7.q12d || legalRisk.has_prior_tps_denial === true,
      part7_13a: part7.q13a, part7_13b: part7.q13b, part7_13c: part7.q13c,
      part7_17: part7.q17,
      part7_18a: part7.q18a, part7_18b: part7.q18b, part7_18c: part7.q18c,
      part7_reviewed: part7.reviewed,
    }

    try {
      const res = await fetch('/api/tps/generate-packet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 422) {
        const data = await res.json().catch(() => ({})) as { missing?: string[] }
        setMissing(data.missing ?? [])
        setBusy(false)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string; detail?: string }
        setError(`${data.error ?? res.statusText}${data.detail ? `: ${data.detail}` : ''}`)
        setBusy(false)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setZipUrl(url)
      setBusy(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  // ── styling shared with parent wizard (rough match) ──
  const input: React.CSSProperties = {
    width: '100%', height: 44, padding: '0 12px',
    background: 'var(--surface)', color: 'var(--text-1)',
    border: '1px solid var(--border)', borderRadius: 10,
    fontSize: 15, marginBottom: 10,
  }
  const label: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 700,
    color: 'var(--text-3)', textTransform: 'uppercase',
    letterSpacing: '0.5px', marginBottom: 4, marginTop: 6,
  }
  const primary: React.CSSProperties = {
    display: 'block', width: '100%', height: 52,
    background: 'var(--success)', color: '#fff',
    fontSize: 16, fontWeight: 800, borderRadius: 12,
    border: 'none', cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.6 : 1, marginTop: 14,
  }
  const secondary: React.CSSProperties = {
    display: 'inline-block', padding: '10px 14px',
    background: 'var(--surface-2)', color: 'var(--text-1)',
    fontSize: 13, fontWeight: 600, borderRadius: 10,
    border: '1px solid var(--border)', cursor: 'pointer',
  }

  // Styles for the post-download instructions panel.
  const postSection: React.CSSProperties = {
    padding: '14px 16px',
    marginBottom: 10,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
  }
  const postHeading: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 800,
    color: 'var(--text-1)',
    marginBottom: 8,
  }
  const postBody: React.CSSProperties = {
    fontSize: 14,
    lineHeight: 1.5,
    color: 'var(--text-2)',
    marginBottom: 8,
  }
  const postList: React.CSSProperties = {
    fontSize: 14,
    lineHeight: 1.65,
    color: 'var(--text-2)',
    paddingLeft: 20,
    marginBottom: 4,
  }
  const postWarn: React.CSSProperties = {
    fontSize: 13,
    lineHeight: 1.4,
    color: 'var(--warning-text, #92400e)',
    background: 'var(--warning-bg, #fef3c7)',
    padding: '8px 10px',
    borderRadius: 8,
    marginTop: 6,
  }
  const postLink: React.CSSProperties = {
    display: 'block',
    padding: '10px 12px',
    marginTop: 6,
    background: 'var(--surface-2)',
    color: 'var(--primary)',
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 8,
    textDecoration: 'none',
    border: '1px solid var(--border)',
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{
          ...secondary, display: 'block', width: '100%', textAlign: 'center',
          marginTop: 10, padding: '14px 16px',
          background: 'var(--success)', color: '#fff', borderColor: 'transparent',
          fontSize: 14, fontWeight: 800,
        }}
        data-testid="open-generate"
      >
        {c.toggleOpen}
      </button>
    )
  }

  return (
    <div
      style={{
        marginTop: 12, padding: 16,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      }}
      data-testid="generate-packet-block"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)' }}>{c.heading}</h3>
        <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13 }}>
          {c.toggleClose}
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 12 }}>{c.intro}</p>

      {/* Form fields */}
      <label style={label}>{c.family}</label>
      <input style={input} value={fields.family_name} onChange={(e) => update('family_name', e.target.value)} />
      <label style={label}>{c.given}</label>
      <input style={input} value={fields.given_name} onChange={(e) => update('given_name', e.target.value)} />
      <label style={label}>{c.middle}</label>
      <input style={input} value={fields.middle_name} onChange={(e) => update('middle_name', e.target.value)} />

      <label style={label}>{c.dob}</label>
      <input type="date" style={input} value={fields.dob} onChange={(e) => update('dob', e.target.value)} />

      <label style={label}>{c.sex}</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button type="button" style={{ ...secondary, flex: 1, background: fields.sex === 'M' ? 'var(--success)' : 'var(--surface-2)', color: fields.sex === 'M' ? '#fff' : 'var(--text-1)' }} onClick={() => update('sex', 'M')}>{c.male}</button>
        <button type="button" style={{ ...secondary, flex: 1, background: fields.sex === 'F' ? 'var(--success)' : 'var(--surface-2)', color: fields.sex === 'F' ? '#fff' : 'var(--text-1)' }} onClick={() => update('sex', 'F')}>{c.female}</button>
      </div>

      <label style={label}>{c.cityob}</label>
      <input style={input} value={fields.city_of_birth} onChange={(e) => update('city_of_birth', e.target.value)} />
      <label style={label}>{c.cob}</label>
      <input style={input} value={fields.country_of_birth} onChange={(e) => update('country_of_birth', e.target.value)} />
      <label style={label}>{c.ssn}</label>
      <input style={input} value={fields.ssn} maxLength={9} placeholder="123456789" onChange={(e) => update('ssn', e.target.value.replace(/\D/g, '').slice(0, 9))} />

      <label style={label}>{c.passport}</label>
      <input data-testid="tps-passport-number-input" style={input} value={fields.passport_number} onChange={(e) => update('passport_number', e.target.value)} />
      <label style={label}>{c.passportCountry}</label>
      <input style={input} value={fields.passport_country_of_issuance} onChange={(e) => update('passport_country_of_issuance', e.target.value)} />
      <label style={label}>{c.passportExp}</label>
      <input data-testid="tps-passport-expiration-input" type="date" style={input} value={fields.passport_expiration_date} onChange={(e) => update('passport_expiration_date', e.target.value)} />
      <p style={{ marginTop: -4, marginBottom: 10, fontSize: 12, color: 'var(--text-3)' }}>{c.passportExpHint}</p>

      <label style={label}>{c.street}</label>
      <input data-testid="field-us-address-street" style={input} value={fields.us_address_street} onChange={(e) => update('us_address_street', e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
        <div>
          <label style={label}>{c.city}</label>
          <input data-testid="field-us-address-city" style={input} value={fields.us_address_city} onChange={(e) => update('us_address_city', e.target.value)} />
        </div>
        <div>
          <label style={label}>{c.state}</label>
          <input data-testid="field-us-address-state" style={input} maxLength={2} placeholder={c.state_placeholder} value={fields.us_address_state} onChange={(e) => update('us_address_state', e.target.value.toUpperCase())} />
        </div>
        <div>
          <label style={label}>{c.zip}</label>
          <input data-testid="field-us-address-zip" style={input} value={fields.us_address_zip} onChange={(e) => update('us_address_zip', e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 10, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          id="field-mailing-different"
          data-testid="field-mailing-different"
          checked={fields.mailing_different}
          onChange={(e) => update('mailing_different', e.target.checked)}
        />
        <label htmlFor="field-mailing-different" style={{ fontSize: 14, cursor: 'pointer' }}>{c.mailingDifferentLabel}</label>
      </div>
      {fields.mailing_different && (
        <div style={{ paddingLeft: 8, borderLeft: '2px solid #d1d5db' }}>
          <label style={label}>{c.mailingStreet}</label>
          <input data-testid="field-mailing-street" style={input} value={fields.mailing_street} onChange={(e) => update('mailing_street', e.target.value)} />
          <label style={label}>{c.mailingCity}</label>
          <input data-testid="field-mailing-city" style={input} value={fields.mailing_city} onChange={(e) => update('mailing_city', e.target.value)} />
          <label style={label}>{c.mailingState}</label>
          <input data-testid="field-mailing-state" style={input} maxLength={2} value={fields.mailing_state} onChange={(e) => update('mailing_state', e.target.value.toUpperCase())} />
          <label style={label}>{c.mailingZip}</label>
          <input data-testid="field-mailing-zip" style={input} value={fields.mailing_zip} onChange={(e) => update('mailing_zip', e.target.value)} />
        </div>
      )}

      <label style={label}>{c.i94}</label>
      <input style={input} value={fields.i94_admission_number} onChange={(e) => update('i94_admission_number', e.target.value)} />
      <label style={label}>{c.entry}</label>
      <input data-testid="field-last-entry-date" type="date" style={input} value={fields.last_entry_date} onChange={(e) => update('last_entry_date', e.target.value)} />

      <label style={label}>{c.phone}</label>
      <input data-testid="field-daytime-phone" style={input} value={fields.daytime_phone} onChange={(e) => update('daytime_phone', e.target.value)} />
      <label style={label}>{c.email}</label>
      <input data-testid="field-email" type="email" style={input} value={fields.email} onChange={(e) => update('email', e.target.value)} />

      {/* A-Number and status at last entry */}
      <label style={label}>{c.aNumber}</label>
      <input style={input} value={fields.a_number} maxLength={9} placeholder="000000000" onChange={(e) => update('a_number', e.target.value.replace(/\D/g, '').slice(0, 9))} />
      <label style={label}>{c.statusEntry}</label>
      <input style={input} value={fields.status_at_last_entry} placeholder="UH" onChange={(e) => update('status_at_last_entry', e.target.value)} />

      {/* Marital status — required for I-821 Part 2 Item 17 */}
      <label style={label}>{c.maritalStatus}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {(['single','married','divorced','widowed','legally_separated','annulled','other'] as const).map((ms) => {
          const labelKey = `ms_${ms === 'legally_separated' ? 'separated' : ms}` as keyof typeof c
          return (
              <button
                data-testid={`field-marital-status-${ms}`}
                key={ms}
              type="button"
              style={{
                ...secondary,
                background: fields.marital_status === ms ? 'var(--success)' : 'var(--surface-2)',
                color: fields.marital_status === ms ? '#fff' : 'var(--text-1)',
                padding: '8px 10px', fontSize: 13,
              }}
              onClick={() => update('marital_status', ms)}
            >
              {c[labelKey] as string}
            </button>
          )
        })}
      </div>

      {/* I-765 application type — only shown when wants_ead */}
      {wantsEad === true && (
        <>
          <label style={label}>{c.i765type}</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['initial','renewal','replacement'] as const).map((t) => {
              const labelKey = `i765_${t}` as keyof typeof c
              return (
                <button
                  key={t}
                  type="button"
                  style={{
                    ...secondary,
                    flex: 1,
                    background: fields.i765_application_type === t ? 'var(--success)' : 'var(--surface-2)',
                    color: fields.i765_application_type === t ? '#fff' : 'var(--text-1)',
                    fontSize: 13,
                  }}
                  onClick={() => update('i765_application_type', t)}
                >
                  {c[labelKey] as string}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ── Part 3 Biographic section ─────────────────────────────────── */}
      <div style={{ marginTop: 16, marginBottom: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>{c.bioHeading}</h4>
      </div>

      {/* Ethnicity */}
      <label style={label}>{c.ethnicity}</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button type="button"
          style={{ ...secondary, flex: 1, background: fields.ethnicity === 'hispanic' ? 'var(--success)' : 'var(--surface-2)', color: fields.ethnicity === 'hispanic' ? '#fff' : 'var(--text-1)', fontSize: 13 }}
          onClick={() => update('ethnicity', 'hispanic')}
        >{c.eth_hispanic}</button>
        <button type="button"
          style={{ ...secondary, flex: 1, background: fields.ethnicity === 'not_hispanic' ? 'var(--success)' : 'var(--surface-2)', color: fields.ethnicity === 'not_hispanic' ? '#fff' : 'var(--text-1)', fontSize: 13 }}
          onClick={() => update('ethnicity', 'not_hispanic')}
        >{c.eth_not}</button>
      </div>

      {/* Race (multi-select) */}
      <label style={label}>{c.race}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {([
          ['race_white', 'race_white'],
          ['race_asian', 'race_asian'],
          ['race_black', 'race_black'],
          ['race_american_indian', 'race_ai'],
          ['race_pacific_islander', 'race_pi'],
        ] as [keyof PersonalFields, keyof typeof c][]).map(([field, labelKey]) => {
          const val = fields[field] as boolean
          return (
            <button key={field} type="button"
              style={{ ...secondary, background: val ? 'var(--success)' : 'var(--surface-2)', color: val ? '#fff' : 'var(--text-1)', fontSize: 13 }}
              onClick={() => update(field, !val as PersonalFields[typeof field])}
            >{c[labelKey] as string}</button>
          )
        })}
      </div>

      {/* Eye color */}
      <label style={label}>{c.eyeColor}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {(['black','blue','brown','gray','green','hazel','maroon','pink','unknown'] as const).map((ec) => {
          const labelKey = `eye_${ec}` as keyof typeof c
          return (
            <button key={ec} type="button"
              style={{ ...secondary, background: fields.eye_color === ec ? 'var(--success)' : 'var(--surface-2)', color: fields.eye_color === ec ? '#fff' : 'var(--text-1)', fontSize: 13, padding: '7px 10px' }}
              onClick={() => update('eye_color', ec)}
            >{c[labelKey] as string}</button>
          )
        })}
      </div>

      {/* Hair color */}
      <label style={label}>{c.hairColor}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {(['bald','black','blonde','brown','gray','red','sandy','white','unknown'] as const).map((hc) => {
          const labelKey = `hair_${hc}` as keyof typeof c
          return (
            <button key={hc} type="button"
              style={{ ...secondary, background: fields.hair_color === hc ? 'var(--success)' : 'var(--surface-2)', color: fields.hair_color === hc ? '#fff' : 'var(--text-1)', fontSize: 13, padding: '7px 10px' }}
              onClick={() => update('hair_color', hc)}
            >{c[labelKey] as string}</button>
          )
        })}
      </div>

      {/* ── Part 7 Background Declaration ────────────────────────────────── */}
      {(() => {
        const hasYes = [
          part7.q4a, part7.q4b, part7.q4c,
          part7.q5a, part7.q5b, part7.q5c,
          part7.q7a, part7.q7b, part7.q7c,
          part7.q8,
          part7.q9a, part7.q9b, part7.q9c, part7.q9d, part7.q9e,
          part7.q11a, part7.q11b, part7.q11c, part7.q11d,
          part7.q12a, part7.q12b, part7.q12c, part7.q12d,
          part7.q13a, part7.q13b, part7.q13c,
          part7.q17, part7.q18a, part7.q18b, part7.q18c,
        ].some(Boolean)

        const questions: [keyof Part7State, keyof typeof c][] = [
          ['q4a','p7_4a'], ['q4b','p7_4b'], ['q4c','p7_4c'],
          ['q5a','p7_5a'], ['q5b','p7_5b'], ['q5c','p7_5c'],
          ['q7a','p7_7a'], ['q7b','p7_7b'], ['q7c','p7_7c'],
          ['q8','p7_8'],
          ['q9a','p7_9a'], ['q9b','p7_9b'], ['q9c','p7_9c'], ['q9d','p7_9d'], ['q9e','p7_9e'],
          ['q11a','p7_11a'], ['q11b','p7_11b'], ['q11c','p7_11c'], ['q11d','p7_11d'],
          ['q12a','p7_12a'], ['q12b','p7_12b'], ['q12c','p7_12c'], ['q12d','p7_12d'],
          ['q13a','p7_13a'], ['q13b','p7_13b'], ['q13c','p7_13c'],
          ['q17','p7_17'],
          ['q18a','p7_18a'], ['q18b','p7_18b'], ['q18c','p7_18c'],
        ]

        return (
          <div
            data-testid="part7-section"
            style={{
              marginTop: 18, padding: '14px 16px',
              border: '2px solid var(--warning-bg, #fef3c7)',
              background: 'var(--surface)',
              borderRadius: 12,
            }}
          >
            <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>{c.part7Heading}</h4>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 12 }}>{c.part7Intro}</p>

            {questions.map(([qKey, textKey]) => {
              const val = part7[qKey] as boolean
              return (
                <div key={qKey} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, paddingTop: 2 }}>
                    <button type="button"
                      style={{ ...secondary, padding: '4px 10px', fontSize: 12, background: val ? 'var(--danger-bg, #fee2e2)' : 'var(--surface-2)', color: val ? 'var(--danger-text, #991b1b)' : 'var(--text-2)', fontWeight: val ? 800 : 500 }}
                      onClick={() => updatePart7(qKey, true)}
                    >Yes</button>
                    <button type="button"
                      style={{ ...secondary, padding: '4px 10px', fontSize: 12, background: !val ? 'var(--success)' : 'var(--surface-2)', color: !val ? '#fff' : 'var(--text-2)', fontWeight: !val ? 800 : 500 }}
                      onClick={() => updatePart7(qKey, false)}
                    >No</button>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.45 }}>{c[textKey] as string}</span>
                </div>
              )
            })}

            {hasYes && (
              <p style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--warning-text, #92400e)', background: 'var(--warning-bg, #fef3c7)', padding: '8px 10px', borderRadius: 8, marginTop: 8 }}>
                {c.part7AttorneyWarning}
              </p>
            )}

            <label
              data-testid="part7-confirm-row"
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                data-testid="part7-confirm-checkbox"
                checked={part7.reviewed}
                onChange={(e) => updatePart7('reviewed', e.target.checked)}
                style={{ marginTop: 2, width: 18, height: 18, accentColor: 'var(--success)', flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{c.part7Confirm}</span>
            </label>
            {!part7.reviewed && (
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{c.part7ConfirmRequired}</p>
            )}
          </div>
        )
      })()}

      {/* B1.1 — Legal-risk routing UI. 3 yes/no questions. Any "yes"
          surfaces a non-blocking amber notice recommending licensed
          immigration attorney / DOJ-accredited representative.
          NEVER blocks generate — informed user decision. */}
      <LegalRiskFlags
        locale={locale}
        value={legalRisk}
        onChange={setLegalRiskFlag}
      />

      {/* P110.2 — Packet Completeness Checker. Shows forms-to-be-included,
          filled vs. missing critical fields, signing locations and
          lockbox preview BEFORE the user clicks Generate. */}
      <PacketCompletenessChecker
        locale={locale}
        fields={fields}
        wantsEad={wantsEad}
        filingPath={filingPath}
        part7Reviewed={part7.reviewed}
      />

      {/* TFR.6 — Attestation gate. Generate stays disabled until checked. */}
      <label
        data-testid="tps-attestation-row"
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          padding: '14px 14px',
          marginTop: 16,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          fontSize: 13,
          lineHeight: 1.5,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          data-testid="tps-attestation-checkbox"
          checked={attestedAt !== null}
          onChange={(e) => setAttested(e.target.checked)}
          style={{ marginTop: 3, width: 18, height: 18, accentColor: 'var(--success)', flexShrink: 0 }}
        />
        <span style={{ color: 'var(--text-1)' }}>{c.attestation}</span>
      </label>

      <button
        type="button"
        onClick={generate}
        disabled={busy || attestedAt === null || !part7.reviewed}
        aria-disabled={busy || attestedAt === null || !part7.reviewed}
        style={{
          ...primary,
          opacity: busy || attestedAt === null || !part7.reviewed ? 0.45 : 1,
          cursor: busy || attestedAt === null || !part7.reviewed ? 'not-allowed' : 'pointer',
          background: busy || attestedAt === null || !part7.reviewed ? 'var(--surface-2)' : primary.background,
          color: busy || attestedAt === null || !part7.reviewed ? 'var(--text-3)' : primary.color,
          boxShadow: busy || attestedAt === null || !part7.reviewed ? 'none' : primary.boxShadow,
        }}
        data-testid="generate-btn"
      >
        {busy ? c.generating : c.generate}
      </button>
      {attestedAt === null && (
        <p
          data-testid="tps-attestation-hint"
          style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, textAlign: 'center' }}
        >
          {c.attestRequired}
        </p>
      )}
      {attestedAt !== null && !part7.reviewed && (
        <p
          data-testid="part7-hint"
          style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, textAlign: 'center' }}
        >
          {c.part7ConfirmRequired}
        </p>
      )}

      {missing.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--warning-bg, #fef3c7)', color: 'var(--warning-text, #92400e)', borderRadius: 10, fontSize: 13 }}>
          <strong>{c.missing}</strong>
          <ul style={{ paddingLeft: 18, marginTop: 4 }}>
            {missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--danger-bg, #fee2e2)', color: 'var(--danger-text, #991b1b)', borderRadius: 10, fontSize: 13 }}>
          <strong>{c.errorHeader}</strong> {error}
        </div>
      )}
      {zipUrl && (
        <div data-testid="post-download" style={{ marginTop: 12 }}>
          {/* Success header + download */}
          <div style={{ padding: 14, background: 'var(--success-bg, #dcfce7)', color: 'var(--success-text, #166534)', borderRadius: 10, fontSize: 14, marginBottom: 12 }}>
            <p style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{c.successHeader}</p>
            <p style={{ marginBottom: 12, lineHeight: 1.45 }}>{c.success}</p>
            <a
              href={zipUrl}
              download="tps-packet-draft.zip"
              style={{
                display: 'inline-block',
                padding: '12px 18px',
                background: 'var(--success)',
                color: '#fff',
                fontWeight: 800,
                fontSize: 15,
                borderRadius: 10,
                textDecoration: 'none',
                marginRight: 8,
                boxShadow: '0 3px 14px rgba(22,163,74,0.30)',
              }}
              data-testid="download-zip"
            >
              ⬇ {c.download}
            </a>
            <button type="button" onClick={generate} style={{ ...secondary, marginLeft: 4 }}>{c.again}</button>
            {/* SP-4 mitigation: one-click PII wipe from the browser. */}
            <div style={{ marginTop: 12 }}>
              {dataCleared ? (
                <p
                  data-testid="clear-data-done"
                  style={{ fontSize: 13, fontWeight: 700, color: 'var(--success-text, #166534)', margin: 0 }}
                >
                  ✓ {c.clearDataDone}
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={clearMyData}
                    data-testid="clear-data-btn"
                    style={{
                      ...secondary,
                      background: 'transparent',
                      color: 'var(--text-2)',
                      border: '1px solid var(--border)',
                      padding: '8px 12px',
                      fontSize: 13,
                    }}
                  >
                    🗑 {c.clearData}
                  </button>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, marginBottom: 0 }}>
                    {c.clearDataHint}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* What's in the ZIP */}
          <section style={postSection}>
            <h4 style={postHeading}>{c.nsZip}</h4>
            <ul style={postList}>
              <li>{c.nsZipI821}</li>
              <li>{c.nsZipI765}</li>
              <li>{c.nsZipReadme}</li>
            </ul>
          </section>

          {/* Where to sign */}
          <section style={postSection}>
            <h4 style={postHeading}>{c.nsSign}</h4>
            <ul style={postList}>
              <li>{c.nsSignI821}</li>
              <li>{c.nsSignI765}</li>
            </ul>
            <p style={postWarn}>{c.nsSignPenWarning}</p>
          </section>

          {/* How to print */}
          <section style={postSection}>
            <h4 style={postHeading}>{c.nsPrint}</h4>
            <p style={postBody}>{c.nsPrintLines}</p>
          </section>

          {/* Envelope checklist */}
          <section style={postSection}>
            <h4 style={postHeading}>{c.nsEnvelope}</h4>
            <ul style={postList}>
              <li>{c.nsEnvelopeI821}</li>
              <li>{c.nsEnvelopeI765}</li>
              <li>{c.nsEnvelopeFee}</li>
              <li>{c.nsEnvelopeEvidence}</li>
              <li>{c.nsEnvelopePassport}</li>
            </ul>
          </section>

          {/* Mailing address (link to USCIS official filing-addresses pages) */}
          <section style={postSection}>
            <h4 style={postHeading}>{c.nsAddress}</h4>
            <p style={postBody}>{c.nsAddressBody}</p>
            <a
              href="https://www.uscis.gov/forms/filing-fees/form-i-821-filing-addresses"
              target="_blank"
              rel="noopener noreferrer"
              style={postLink}
            >
              {c.nsAddressI821Link}
            </a>
            <a
              href="https://www.uscis.gov/forms/filing-fees/form-i-765-filing-addresses"
              target="_blank"
              rel="noopener noreferrer"
              style={postLink}
            >
              {c.nsAddressI765Link}
            </a>
          </section>

          {/* Online filing alternative */}
          <section style={postSection}>
            <h4 style={postHeading}>{c.nsOnline}</h4>
            <p style={postBody}>{c.nsOnlineBody}</p>
            <a
              href="https://my.uscis.gov"
              target="_blank"
              rel="noopener noreferrer"
              style={postLink}
            >
              {c.nsOnlineLink}
            </a>
          </section>

          {/* Official sources */}
          <section style={{ ...postSection, background: 'var(--surface-2)' }}>
            <h4 style={postHeading}>{c.nsSourcesTitle}</h4>
            <a href="https://www.uscis.gov/humanitarian/temporary-protected-status/TPS-Ukraine" target="_blank" rel="noopener noreferrer" style={postLink}>{c.nsSourceTpsPage} ↗</a>
            <a href="https://www.uscis.gov/i-821" target="_blank" rel="noopener noreferrer" style={postLink}>{c.nsSourceI821} ↗</a>
            <a href="https://www.uscis.gov/i-765" target="_blank" rel="noopener noreferrer" style={postLink}>{c.nsSourceI765} ↗</a>
            <a href="https://www.uscis.gov/humanitarian/temporary-protected-status" target="_blank" rel="noopener noreferrer" style={postLink}>{c.nsSourceTpsGeneral} ↗</a>
          </section>
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, marginTop: 14 }}>{c.legal}</p>
    </div>
  )
}
