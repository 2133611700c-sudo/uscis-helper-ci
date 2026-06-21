/**
 * packetBuilder — top-level: TPSAnswers → ZIP { i-821.pdf, i-765.pdf, README.txt }.
 *
 * Reads the official USCIS PDFs from apps/web/public/uscis/tps/, applies the
 * field maps via pdfPrefiller, and bundles the result into a ZIP via jszip.
 *
 * This file is server-only (uses fs).
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'

import type { TPSAnswers } from './answers'
import { buildI821Ops } from './forms/i821FieldMap'
import { buildI765Ops } from './forms/i765FieldMap'
// CANONICAL_CONTINUITY: canonical path for document-derived ops
import type { CanonicalDocumentResult } from '@/lib/canonical/types'
import { buildI821DocumentOps } from '@/lib/canonical/forms/i821DocumentMapper'
import { i821DocumentFactsToCanonical } from './forms/i821DocumentBoundary'
import { prefill } from './pdfPrefiller'
import { lockboxFor, feeGuidance, SNAPSHOT_DATE, OFFICIAL_TPS_UKRAINE_PAGE } from './filingGuidance'
import { assertFormIntegrity } from './formIntegrity'
import { buildAuditRows, summarizeProvenance, type ProvenanceMap, type ProvenanceSummary, type PdfAuditRow } from './provenance'
import {
  shouldTranslateForTPSPacket,
  translationFileName,
  CERTIFICATION_FILENAME,
  generateTPSTranslation,
  translateBookletFromBrain,
  type TPSDocumentType,
} from './translationBridge'
import type { MergedField, RejectedField } from './centralBrain'
import { generateTranslationPDF } from '@/lib/packet/pdf'
import type { PacketInput } from '@/lib/packet/types'

// Edition dates verified against uscis.gov on 2026-05-10 and stamped on the
// PDF footers. If USCIS publishes a new edition, scripts/uscis/refresh_tps_forms.sh
// re-downloads and re-validates; the build will fail until both this constant
// and the underlying PDF are refreshed in lockstep.
const I821_EDITION = '01/20/25'
const I765_EDITION = '08/21/25'

function publicPdfPath(name: string): string {
  return path.join(process.cwd(), 'public', 'uscis', 'tps', name)
}

export interface PacketResult {
  zipBytes: Uint8Array
  i821: { applied: number; skipped: number; firstSkips: string[] }
  i765: { applied: number; skipped: number; firstSkips: string[] }
  /** Phase 2: provenance audit summary (null if no provenance was provided) */
  auditSummary: ProvenanceSummary | null
  /** Translation files included in ZIP */
  translations: { docType: string; filename: string }[]
}

export interface TranslationOptions {
  /** Which document types were uploaded (determines which need translation) */
  uploadedDocTypes?: TPSDocumentType[]
  /** User's typed name for certification signer */
  signerName?: string
  /** User's address for certification */
  signerAddress?: string
  /** Base64 PNG signature from SignaturePad (null = blank line for paper signing) */
  signatureDataUrl?: string | null
  /** Controlling spellings from DL/MRZ that override Cyrillic transliteration */
  controllingSpellings?: Record<string, string>
  /** Central Brain merged output — when present, used as primary source for booklet translation. */
  brainMerged?: Record<string, MergedField> | null
  /** CB rejected fields — includes booklet-slot fields blocked by form contract (used for translation). */
  brainRejected?: RejectedField[] | null
  /** Manual wizard entries — lowest-priority fallback for translation fields. */
  brainManual?: Record<string, string> | null
  /**
   * User confirmed review of translation draft per 8 CFR §103.2(b)(3).
   * Translation is EXCLUDED from ZIP when false or absent.
   * Set by TranslationReviewGate component after user checks the certification checkbox.
   */
  reviewConfirmed?: boolean
}

export async function buildPacket(
  answers: TPSAnswers,
  provenance?: ProvenanceMap | null,
  translationOpts?: TranslationOptions | null,
  /** CANONICAL_CONTINUITY: when provided, document-derived I-821 ops come from
   * the resolved canonical result instead of the legacy boundary conversion.
   * normalizeCountryOfBirth is NOT re-applied when using the canonical path
   * (normalization already ran at extraction time). */
  documentCanonical?: CanonicalDocumentResult | null,
): Promise<PacketResult> {
  // Read official PDFs from the public/ bundle (Vercel includes these in the
  // serverless function's filesystem).
  const [i821Bytes, i765Bytes] = await Promise.all([
    fs.readFile(publicPdfPath('i-821.pdf')),
    fs.readFile(publicPdfPath('i-765.pdf')),
  ])

  // CB.6 — Runtime integrity guard. Throws if the on-disk PDF was
  // swapped without updating PINNED_HASHES + field map together.
  // Cached after first hit, so this is single-digit milliseconds once
  // per process. Verified bytes flow straight into the prefiller.
  assertFormIntegrity('i-821.pdf', i821Bytes)
  if (answers.wants_ead) assertFormIntegrity('i-765.pdf', i765Bytes)

  // Build prefill operations from the field maps.
  // CANONICAL_CONTINUITY: use resolved canonical if available (shadow/enforce modes),
  // else fall back to legacy boundary (LEGACY FALLBACK — allowed in off/shadow only.
  // In enforce mode this line is unreachable — the route guarantees documentCanonical).
  const i821DocumentOps = documentCanonical
    ? buildI821DocumentOps(documentCanonical)           // CANONICAL PATH (Part C: no re-normalization)
    : buildI821DocumentOps(i821DocumentFactsToCanonical(answers))  // LEGACY PATH
  // buildI821Ops includes USER_DECLARED / PRODUCT_CONFIG fields not owned by the canonical mapper.
  // We replace only the document-derived ops; the full I821Ops from buildI821Ops covers the rest.
  // In canonical mode: build full ops set from legacy then override doc-derived fields with canonical.
  const i821Ops = documentCanonical
    ? (() => {
        // Merge: take all non-doc-derived ops from buildI821Ops, then prepend canonical doc ops.
        // CANONICAL_PATH comment: normalizeCountryOfBirth already ran at extraction time — skipped here.
        const allOps = buildI821Ops(answers)
        const docFieldNames = new Set(i821DocumentOps.map((op) => op.field))
        const userDeclaredOps = allOps.filter((op) => !docFieldNames.has(op.field))
        return [...i821DocumentOps, ...userDeclaredOps]
      })()
    : buildI821Ops(answers)
  // Skip I-765 entirely if the user didn't ask for an EAD.
  const i765Ops = answers.wants_ead ? buildI765Ops(answers) : []

  // Run the prefiller on each — clean forms, no watermarks.
  const i821Filled = await prefill(new Uint8Array(i821Bytes), i821Ops, {
    edition: I821_EDITION,
  })
  const i765Filled = answers.wants_ead
    ? await prefill(new Uint8Array(i765Bytes), i765Ops, {
        edition: I765_EDITION,
      })
    : null

  // Bundle into a ZIP: clean forms + instruction only.
  // Client-facing rule: NO watermarks, NO draft marks, NO internal audit files.
  // AUDIT_PROVENANCE stays internal (computed but not exported to client).
  const zip = new JSZip()
  zip.file('I-821.pdf', i821Filled.bytes)
  if (i765Filled) zip.file('I-765.pdf', i765Filled.bytes)
  // Single instruction file — merges README + CHECKLIST + multilingual.
  // Client gets exactly 3 files: I-821.pdf, I-765.pdf, INSTRUCTION.txt
  const langHeader = [
    '╔══════════════════════════════════════════════════════════╗',
    '║          INSTRUCTION / ІНСТРУКЦІЯ / ИНСТРУКЦИЯ           ║',
    '╠══════════════════════════════════════════════════════════╣',
    '║                                                          ║',
    '║  This file contains instructions in 3 languages:         ║',
    '║                                                          ║',
    '║  🇺🇸  ENGLISH .............. scroll down / see below      ║',
    '║  🇷🇺  РУССКИЙ .............. search: "ИНСТРУКЦИЯ"         ║',
    '║  🇺🇦  УКРАЇНСЬКА ........... search: "ІНСТРУКЦІЯ"         ║',
    '║                                                          ║',
    '╚══════════════════════════════════════════════════════════╝',
    '',
    '',
  ].join('\n')

  zip.file('INSTRUCTION.txt',
    langHeader +
    '🇺🇸  ENGLISH\n' +
    '═'.repeat(60) + '\n\n' +
    buildReadme(answers, i821Filled, i765Filled) +
    '\n\n' + '═'.repeat(60) + '\n\n' +
    buildChecklist(answers) +
    '\n\n' + '═'.repeat(60) + '\n\n' +
    buildMultilingualSections(answers)
  )

  // ── Translation: auto-generate for foreign-language evidence documents ──
  // ADR-006: one upload → two products (forms + translation).
  // 8 CFR §103.2(b)(3): any foreign-language document MUST have English translation.
  const translations: { docType: string; filename: string }[] = []
  if (translationOpts?.uploadedDocTypes) {
    for (const docType of translationOpts.uploadedDocTypes) {
      if (!shouldTranslateForTPSPacket(docType)) continue

      try {
        const signerOpts = {
          signerName: translationOpts.signerName || '',
          signerAddress: translationOpts.signerAddress || '',
          signatureDataUrl: translationOpts.signatureDataUrl ?? null,
        }
        // Primary: use Central Brain merged fields when available (already normalized English).
        // Fallback: derive from TPSAnswers (legacy path for pre-CB requests).
        const brainMerged = translationOpts.brainMerged
        const result =
          docType === 'passportBooklet' && brainMerged
            ? translateBookletFromBrain(brainMerged, {
                ...signerOpts,
                rejected: translationOpts.brainRejected ?? [],
                manual: translationOpts.brainManual ?? {},
              })
            : generateTPSTranslation(
                answers,
                docType,
                signerOpts.signerName,
                signerOpts.signerAddress,
                signerOpts.signatureDataUrl,
                translationOpts.controllingSpellings || {},
              )
        // reviewConfirmed: true required per 8 CFR §103.2(b)(3) certification boundary.
        // Translation EXCLUDED from ZIP until user reviews and confirms in TranslationReviewGate.
        const reviewConfirmed = translationOpts.reviewConfirmed === true
        if (result && result.violations.length === 0 && reviewConfirmed) {
          const filename = translationFileName(docType)
          // HTML format: professional layout, printable, includes certification
          zip.file(filename.replace('.pdf', '.html'), result.translation_html)
          zip.file(CERTIFICATION_FILENAME.replace('.pdf', '.html'), result.certification_html)
          // PDF format: bureau-style 2-page PDF (translation + certification)
          if (result._rawFields) {
            try {
              const pdfInput = buildTranslationPacketInput(
                result._rawFields,
                result._signerName ?? '',
                result._signerAddress ?? '',
                docType,
              )
              const pdfBuffer = await generateTranslationPDF(pdfInput)
              zip.file(filename, pdfBuffer)
            } catch (pdfErr) {
              console.warn(`[packetBuilder] PDF generation failed for ${docType}, HTML only`, pdfErr)
            }
          }
          translations.push({ docType, filename })
        }
      } catch {
        // Translation generation failed — log but don't block forms.
        // Forms are critical; translation is an enhancement.
        console.warn(`[packetBuilder] Translation failed for ${docType}, skipping`)
      }
    }
  }

  // Phase 2: generate audit rows from provenance sidecar (if provided).
  // Audit rows link each PDF field → canonical answer → source document → extraction method.
  // The report contains NO PII — only field names, sources, methods, and structural counts.
  let auditSummary: ProvenanceSummary | null = null
  if (provenance) {
    // Compute applied field sets from ops minus skipped
    const i821SkippedSet = new Set(i821Filled.skipped.map((s) => s.field))
    const i821Applied = new Set(i821Ops.map((op) => op.field).filter((f) => !i821SkippedSet.has(f)))
    const i821AuditRows = buildAuditRows(
      i821Ops.map((op) => ({ field: op.field, kind: op.kind, value: op.value })),
      'I-821',
      provenance,
      i821Applied,
    )
    let i765AuditRows: ReturnType<typeof buildAuditRows> = []
    if (i765Filled) {
      const i765SkippedSet = new Set(i765Filled.skipped.map((s) => s.field))
      const i765Applied = new Set(i765Ops.map((op) => op.field).filter((f) => !i765SkippedSet.has(f)))
      i765AuditRows = buildAuditRows(
        i765Ops.map((op) => ({ field: op.field, kind: op.kind, value: op.value })),
        'I-765',
        provenance,
        i765Applied,
      )
    }
    const allRows = [...i821AuditRows, ...i765AuditRows]
    auditSummary = summarizeProvenance(allRows)
    // AUDIT_PROVENANCE stays internal — NOT included in client ZIP.
    // Client gets only clean forms + instruction.
  }

  const zipBytes = await zip.generateAsync({ type: 'uint8array' })

  return {
    zipBytes,
    i821: {
      applied: i821Filled.applied,
      skipped: i821Filled.skipped.length,
      firstSkips: i821Filled.skipped.slice(0, 5).map((s) => `${s.field} (${s.reason})`),
    },
    i765: i765Filled
      ? {
          applied: i765Filled.applied,
          skipped: i765Filled.skipped.length,
          firstSkips: i765Filled.skipped.slice(0, 5).map((s) => `${s.field} (${s.reason})`),
        }
      : { applied: 0, skipped: 0, firstSkips: [] },
    auditSummary,
    translations,
  }
}

function buildTranslationPacketInput(
  rawFields: Record<string, string>,
  signerName: string,
  signerAddress: string,
  docType: TPSDocumentType,
): PacketInput {
  const scopeMap: Partial<Record<TPSDocumentType, string>> = {
    passportBooklet: 'Ukrainian Internal Passport (Book Format)',
    passport: 'Ukrainian International Passport',
  }
  return {
    scopeTitle: scopeMap[docType] ?? `Ukrainian Document (${docType})`,
    documentType: 'ua_passport_booklet',
    sessionId: `tps-pdf-${Date.now()}`,
    fields: Object.entries(rawFields)
      .filter(([, v]) => v && v.trim())
      .map(([field, value]) => ({
        field,
        source_label: field,
        source_zone: 'tps_packet',
        bbox: [0, 0, 0, 0] as [number, number, number, number],
        raw_value: value,
        normalized_value: value,
        language_layer: 'unknown' as const,
        confidence: 1.0,
        review_required: false,
      })),
    sourceTraces: [],
    certificationRecord: {
      signer_full_name: signerName,
      language_pair_confirmed: true,
      statement:
        'I certify that I am competent in both the Ukrainian and English languages, and that the above is a true and accurate translation of the document submitted.',
      signature_typed_name: signerName,
      signed_at: new Date().toISOString(),
      source_language: 'Ukrainian',
      address: signerAddress,
      certification_version: '8cfr_103_2_b_3_v1',
    },
  }
}

/**
 * Multilingual instruction sections — RU + UK translations of key instructions.
 * Appended after the English README + CHECKLIST in INSTRUCTION.txt.
 */
function buildMultilingualSections(a: TPSAnswers): string {
  const ead = a.wants_ead
  return [
    '🇷🇺  РУССКИЙ',
    '═'.repeat(60),
    '',
    '📋 ИНСТРУКЦИЯ',
    '',
    'ЧТО НАХОДИТСЯ В ЭТОМ ПАКЕТЕ',
    '  • Form I-821 (PDF) — заявление на TPS, заполнено вашими данными',
    ead ? '  • Form I-765 (PDF) — заявление на разрешение на работу (EAD)' : null,
    '  • Этот файл с инструкциями',
    '',
    'ЧТО НУЖНО СДЕЛАТЬ',
    '  1. Откройте каждую PDF-форму и внимательно проверьте ВСЕ заполненные поля.',
    '  2. Если что-то неправильно — исправьте в Adobe Acrobat Reader.',
    '  3. Распечатайте обе формы.',
    '  4. Подпишите РУЧКОЙ (чёрной или синей) — в каждой форме есть строка для подписи.',
    '     ⚠️  ВНИМАНИЕ: USCIS может ОТКЛОНИТЬ заявление и НЕ ВЕРНУТЬ ПОШЛИНУ,',
    '     если подпись не от руки (напечатанная, скопированная или поставленная штампом).',
    '  5. Соберите все документы (см. чек-лист выше на английском).',
    '  6. Оплатите госпошлину USCIS (проверьте актуальную сумму на uscis.gov/g-1055).',
    '  7. Отправьте пакет почтой по адресу, указанному выше.',
    '',
    'ВАЖНО',
    '  • Messenginfo НЕ подаёт документы за вас. Вы подаёте самостоятельно.',
    '  • Messenginfo НЕ является юридической фирмой и НЕ даёт юридических советов.',
    '  • Проверьте все данные перед отправкой.',
    '  • Сохраните копии всех документов для себя.',
    '',
    '',
    '═'.repeat(60),
    '',
    '',
    '🇺🇦  УКРАЇНСЬКА',
    '═'.repeat(60),
    '',
    '📋 ІНСТРУКЦІЯ',
    '',
    'ЩО ЗНАХОДИТЬСЯ В ЦЬОМУ ПАКЕТІ',
    '  • Form I-821 (PDF) — заява на TPS, заповнена вашими даними',
    ead ? '  • Form I-765 (PDF) — заява на дозвіл на роботу (EAD)' : null,
    '  • Цей файл з інструкціями',
    '',
    'ЩО ПОТРІБНО ЗРОБИТИ',
    '  1. Відкрийте кожну PDF-форму та уважно перевірте ВСІ заповнені поля.',
    '  2. Якщо щось неправильно — виправте в Adobe Acrobat Reader.',
    '  3. Роздрукуйте обидві форми.',
    '  4. Підпишіть РУЧКОЮ (чорною або синьою) — у кожній формі є рядок для підпису.',
    '     ⚠️  УВАГА: USCIS може ВІДХИЛИТИ заяву і НЕ ПОВЕРНУТИ МИТО,',
    '     якщо підпис не від руки (надрукований, скопійований або поставлений штампом).',
    '  5. Зберіть усі документи (див. чек-лист вище англійською).',
    '  6. Сплатіть держмито USCIS (перевірте актуальну суму на uscis.gov/g-1055).',
    '  7. Відправте пакет поштою за адресою, вказаною вище.',
    '',
    'ВАЖЛИВО',
    '  • Messenginfo НЕ подає документи за вас. Ви подаєте самостійно.',
    '  • Messenginfo НЕ є юридичною фірмою і НЕ надає юридичних порад.',
    '  • Перевірте всі дані перед відправкою.',
    '  • Збережіть копії всіх документів для себе.',
  ].filter(Boolean).join('\n')
}

/**
 * Practical packing checklist — what the user must put in the envelope
 * (paper filing) or have ready (online filing). No legal promises.
 */
function buildChecklist(a: TPSAnswers): string {
  const items: string[] = []
  let n = 0

  const add = (text: string) => { n++; items.push(`  [ ] ${n}. ${text}`) }

  add('Form I-821 — printed, reviewed, and SIGNED in ink (black or blue pen).')
  if (a.wants_ead) {
    add('Form I-765 — printed, reviewed, and SIGNED in ink.')
  }
  add('Photocopy of your passport identity page (the page with your photo and MRZ).')
  add('Photocopy or printout of your I-94 record (from i94.cbp.dhs.gov or paper copy).')
  if (a.a_number) {
    add('Photocopy of your EAD card or I-797 notice (front and back) showing your A-Number.')
  }
  add('Two (2) identical passport-style photographs (2" x 2"), with your name and A-Number (if any) written lightly in pencil on the back.')
  add('Government filing fee — check or money order payable to "U.S. Department of Homeland Security". Verify the current amount on uscis.gov before mailing.')
  if (a.wants_fee_waiver) {
    add('Form I-912 (Request for Fee Waiver) with supporting evidence, if you are requesting a waiver.')
    add('Note: certain fees required by H.R.1 CANNOT be waived. See README.txt for details.')
  }
  add('Any additional supporting evidence you believe strengthens your application (optional).')
  add('Final review: re-read every field on each form before sealing the envelope.')

  return [
    'Messenginfo — TPS Ukraine packing checklist',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Before mailing (or before starting online filing), confirm you have each item:',
    '',
    ...items,
    '',
    'IMPORTANT REMINDERS',
    '  - Messenginfo does NOT file this package for you. You mail or submit it yourself.',
    '  - Messenginfo does NOT provide legal advice.',
    '  - Double-check the mailing address in README.txt before sending.',
    '  - Keep a photocopy of everything you mail for your records.',
  ].join('\n')
}

function buildReadme(
  a: TPSAnswers,
  i821: { applied: number; skipped: { field: string; reason: string }[] },
  i765: { applied: number; skipped: { field: string; reason: string }[] } | null,
): string {
  const ts = new Date().toISOString()
  // The README's "N fields prefilled" number is the same `applied` count
  // that we expose in the X-TPS-{I821,I765}-Applied response headers — see
  // apps/web/src/app/api/tps/generate-packet/route.ts. If a future audit
  // sees the header and the README disagree, the bug is upstream of this
  // function (likely in the prefiller). Field count semantics: this is the
  // total number of AcroForm cells we successfully wrote (text + checkbox +
  // dropdown), NOT only text fields. Different sessions can legitimately
  // show different totals because skipped optional-section fields lower
  // the count.
  // ── Lockbox section ──────────────────────────────────────────────────────
  // The README is the LAST surface a user sees before mailing. The audit
  // explicitly flagged that "see the lockbox in the I-821 Instructions"
  // dumps the user into another PDF — we now resolve and print the address
  // for them based on their state. Falls back to a "look it up" message if
  // we can't determine the state.
  const lockboxLines: string[] = []
  const lockbox = lockboxFor(a.us_address_state ?? '')
  if (lockbox.ok) {
    lockboxLines.push(
      `WHERE TO MAIL (resolved for state: ${lockbox.state})`,
      `  ${lockbox.lockbox.display_name}`,
      '',
      '  By U.S. Postal Service:',
      ...lockbox.lockbox.usps.map((l) => '    ' + l),
      '',
      '  By FedEx, UPS, or DHL (street address — NOT for USPS):',
      ...lockbox.lockbox.courier.map((l) => '    ' + l),
      '',
      `  Source: ${lockbox.source_url}`,
      `  Snapshot date: ${lockbox.snapshot_date}. Verify before mailing — addresses can change.`,
    )
  } else {
    lockboxLines.push(
      'WHERE TO MAIL',
      `  We could not resolve a lockbox address for state code "${lockbox.state}".`,
      `  Look up the current address on the official USCIS TPS Ukraine page:`,
      `    ${lockbox.source_url}`,
    )
  }

  // ── Fee section ──────────────────────────────────────────────────────────
  // Per official_source_rule: enumerate WHICH fees apply, link to the
  // USCIS Fee Schedule for each. Do NOT print dollar amounts — they change.
  const fees = feeGuidance({
    filing_path: a.filing_path ?? 'unselected',
    wants_ead: !!a.wants_ead,
    wants_fee_waiver: !!a.wants_fee_waiver,
    age: null,
  })
  const feeLines: string[] = [
    'GOVERNMENT FEES (verify current amounts on uscis.gov before mailing)',
  ]
  for (const f of fees.applicable) {
    feeLines.push(`  • ${f.form} — ${f.reason}`)
    feeLines.push(`    ${f.fee_lookup_url}`)
  }
  for (const note of fees.notes) {
    feeLines.push(`  Note: ${note}`)
  }

  return [
    'Messenginfo — TPS Ukraine packet draft',
    `Generated: ${ts}`,
    '',
    'WHAT THIS IS',
    '  Two PDFs prefilled with the data you typed into the wizard:',
    `    I-821 (Application for TPS) — edition ${I821_EDITION}, ${i821.applied} AcroForm cells written`,
    a.wants_ead && i765
      ? `    I-765 (Application for EAD) — edition ${I765_EDITION}, ${i765.applied} AcroForm cells written, category (${a.ead_category === 'a12' ? 'a' : 'c'})(${a.ead_category === 'a12' ? '12' : '19'})`
      : '    I-765 was not generated (you chose not to request an EAD).',
    '',
    'WHAT TO DO',
    '  1. Open each PDF in Adobe Acrobat Reader or Preview.',
    '  2. Carefully review every prefilled field. Correct anything that is wrong.',
    '  3. Complete every field that we could not fill (signature, certain Part 3/4 items).',
    '  4. Print, sign in INK (black or blue pen), and assemble your supporting documents.',
    '     *** SIGNATURE WARNING — APPLIES TO THIS PRINTED PAPER PACKET (MAIL FILING) ONLY ***',
    '     (Federal Register doc 2026-09289, effective 2026-07-10)',
    '     USCIS may DENY your application AND RETAIN YOUR FILING FEE if it later finds',
    '     an invalid signature on forms I-821 / I-765. Invalid = copy-pasted image,',
    '     typed name, software-generated, or stamped. Sign BY HAND on the printed paper.',
    '     No cure is allowed. NOTE: This rule applies to the USCIS form signatures only.',
    '     It does NOT apply to document translations or any other attachments.',
    '  5. Pay the correct USCIS government fee (see FEE section below).',
    '     Note: fees required by H.R.1 (TPS employment authorization fee, I-94 fee)',
    '     CANNOT be waived via Form I-912 — they are non-waivable by statute.',
    '  6. Mail the package to the address shown below.',
    '',
    ...lockboxLines,
    '',
    ...feeLines,
    '',
    'IF YOU ARE FILING ONLINE (myUSCIS)',
    '  If you choose to file online instead of by mail:',
    '  1. Log in to your myUSCIS account at my.uscis.gov yourself.',
    '  2. Use the generated PDF forms as a reference — open them side by side.',
    '  3. Type each field value into the online form independently.',
    '  4. Upload required evidence and passport-style photo as the online form requests.',
    '  5. Review everything on screen before submitting.',
    '  6. Submit independently — Messenginfo does not submit for you.',
    '  Note: online filing availability depends on USCIS. Check uscis.gov for current status.',
    '',
    'WHAT WE DID NOT DO',
    '  - We did NOT submit anything to USCIS on your behalf.',
    '  - We did NOT give you legal advice.',
    '  - We did NOT determine your eligibility — please verify on uscis.gov.',
    '',
    'SOURCE FORMS',
    `  These PDFs were generated from the official USCIS PDFs verified against`,
    `  uscis.gov pages and PDF footer edition stamps on ${SNAPSHOT_DATE}.`,
    `  Official TPS Ukraine page: ${OFFICIAL_TPS_UKRAINE_PAGE}`,
    '  See messenginfo.com/services/tps-ukraine/sources for all source links.',
    '',
    'If a field looks wrong, do NOT mail the form. Edit it in Adobe first or',
    'come back to messenginfo.com and re-run the wizard with corrected data.',
  ].join('\n')
}

/**
 * Build a PII-free audit report from provenance rows.
 * Contains field names, source documents, extraction methods, and counts only.
 * No values, no raw text, no personal data.
 */
function buildAuditReport(rows: PdfAuditRow[], summary: ProvenanceSummary): string {
  const ts = new Date().toISOString()
  const lines: string[] = [
    'Messenginfo — Provenance Audit Report',
    `Generated: ${ts}`,
    '',
    'This report shows WHERE each PDF field value came from (which document,',
    'which extraction method) and whether it was auto-filled or manually entered.',
    'No personal data or field values are included.',
    '',
    '── SUMMARY ────────────────────────────────────────────────────────────',
    `Total fields:         ${summary.total_fields}`,
    `Auto (with source):   ${summary.auto_with_source}`,
    `User manual:          ${summary.user_manual}`,
    `System default:       ${summary.system_default}`,
    `Unknown provenance:   ${summary.unknown_provenance}`,
    '',
    'Source breakdown:',
  ]
  for (const [src, count] of Object.entries(summary.source_breakdown)) {
    lines.push(`  ${src}: ${count}`)
  }
  lines.push('', 'Method breakdown:')
  for (const [meth, count] of Object.entries(summary.method_breakdown)) {
    lines.push(`  ${meth}: ${count}`)
  }
  lines.push(
    '',
    '── PER-FIELD DETAIL ───────────────────────────────────────────────────',
    '',
  )
  for (const r of rows) {
    lines.push(
      `${r.pdf_form} | ${r.canonical_field}`,
      `  pdf_field:  ${r.pdf_field_name}`,
      `  source:     ${r.source_document_type}`,
      `  method:     ${r.extraction_method}`,
      `  confidence: ${r.confidence !== null ? r.confidence.toFixed(2) : 'n/a'}`,
      `  review:     ${r.user_review_status}`,
      `  written:    ${r.pdf_written ? 'yes' : 'no'}`,
      '',
    )
  }
  return lines.join('\n')
}
