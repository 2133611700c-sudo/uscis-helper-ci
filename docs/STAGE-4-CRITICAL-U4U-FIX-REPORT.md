# Stage 4 Critical U4U Fix — Production Readiness Report

**Branch:** stage-4-fix-critical-u4u
**Date:** 2026-05-03
**Source:** Combined audit ZIPs (01-supabase-database-audit.md + 02-FINAL-VERDICT.md + 03-FINAL-CONFIRMATION.md)
**USCIS facts verified:** 2026-05-03 from uscis.gov (Taras personal verification)

---

## Source Interpretation

- **ZIP 1** ("новый аудит и промты.zip"): Contains 01 + 02 only.
- **ZIP 2** ("новый аудит.zip"): Contains 01 + 02 + **03-FINAL-CONFIRMATION.md** — supersedes ZIP 1.
- **ZIP 2 is the authoritative source.** All facts from 03-FINAL-CONFIRMATION.md override earlier context.

Key conflicts resolved:
1. Item 1.e vs 10.C — 03-FINAL-CONFIRMATION is explicit: use 1.e. 10.C = old streamlined (eliminated June 2025).
2. Program status — paused Jan 27 2025, resumed June 9 2025 federal court order.
3. Two-fee structure — filing fee + parole grant fee (Oct 2025 effective).
4. Medical attestation required (vaccines + TB IGRA test).
5. EAD: DO NOT file I-765 before I-131 approval.
6. Fee waiver: Form I-912, paper-only filing.

---

## What PR #14 Already Had (fix/critical-audit-gaps)

PR #14 commit `ccd09a8` addressed:
- `serviceData/re-parole-u4u.ts`: item_for_u4u changed 10.C → 1.e, item_label updated
- `messages/*.json` (4 locales): verified.facts.item updated to Part 2, Item 1.e
- `messages/*.json` (4 locales): statusWarning, feeNotice, processingWarning keys added
- `packet/generate/route.ts`: checklist updated with 1.e, PROGRAM STATUS notice, fee structure
- `types.ts`: statusWarningKey, feeNoticeKey, processingWarningKey added to ServiceData

PR #14 did NOT address:
- Medical attestation note (medicalNote)
- EAD timing warning (eadWarning)
- Fee waiver I-912 info (feeWaiverNote)
- Structured multi-file ZIP (was still 1-2 TXT files)
- Packet audit_log using 'packet_generated' (was using 'packet.generated')
- Generated_packets table logging
- ES FAQ columns migration
- 12 re-parole FAQ entries in all 4 locales

**This branch is built from main (not from PR #14 branch).** Main does NOT include PR #14 yet. This branch re-implements everything PR #14 did plus all missing items.

---

## Fixed in This Branch

### 3A. Item 1.e — Complete
- `apps/web/src/data/serviceData/re-parole-u4u.ts`: `item_for_u4u: '1.e'`, item_label updated
- All 4 message files: verified.facts.item → "Part 2, Item 1.e — Select 'I am outside the United States...'"
- `packet/generate/route.ts`: `build05FormGuide()` explicitly states Item 1.e, marks 10.C as ELIMINATED

### 3B. U4U Status Banner — Complete
- All 4 locales: `statusWarning` key added with calm factual language
- `types.ts`: `statusWarningKey` added to ServiceData interface
- `serviceData/re-parole-u4u.ts`: statusWarningKey wired
- `page.tsx`: amber banner rendered for re-parole-u4u

### 3C. Fee Disclosure — Complete
- All 4 locales: `feeNotice` key with two-fee structure + links to feecalculator + g-1055
- Packet `08-fees-and-links.txt`: explicit two-fee explanation, no hardcoded amounts
- `fees.fee_waiver_url` added to ServiceFeesInfo type

### 3D. Medical Attestation — NEW, Complete
- All 4 locales: `medicalNote` key added
- `types.ts`: `medicalNoteKey` optional field in ServiceData
- `serviceData/re-parole-u4u.ts`: `medicalNoteKey` wired
- `page.tsx`: medicalNote rendered in amber banner
- Packet `07-document-checklist.txt`: "MEDICAL DOCUMENTATION" section with vaccines + TB/IGRA

### 3E. EAD Warning — NEW, Complete
- All 4 locales: `eadWarning` key added
- `types.ts`: `eadWarningKey` optional field
- `serviceData/re-parole-u4u.ts`: `eadWarningKey` wired
- `page.tsx`: eadWarning rendered in amber banner
- Packet `07-document-checklist.txt`: "EAD / WORK AUTHORIZATION — IMPORTANT" section

### 3F. Fee Waiver I-912 — NEW, Complete
- All 4 locales: `feeWaiverNote` key added
- `types.ts`: `feeWaiverNoteKey` optional field
- `serviceData/re-parole-u4u.ts`: `feeWaiverNoteKey` + `fees.fee_waiver_url` wired
- `page.tsx`: feeWaiverNote rendered in amber banner
- Packet `06-filing-instructions.txt` and `07-document-checklist.txt`: I-912 info

### 3G. Processing Time — Complete
- All 4 locales: `processingWarning` key — "vary significantly, check uscis.gov/processing-times"
- No hardcoded "8-21 months" in user-facing text
- Packet `08-fees-and-links.txt`: links to processing-times

### 3H. OCR Honest Label — Already in main (Screen05.tsx)
- No change needed — verified in main that manual review label already correct.

### 3I. Structured Multi-File Packet ZIP — NEW, Complete
Route `apps/web/src/app/api/packet/generate/route.ts` completely rewritten:

Before: 2 TXT files (checklist.txt, README.txt)
After: 9 structured TXT files:
- 01-overview.txt — session ID, file list, how to use
- 02-applicant-summary.txt — name/address/phone/email/members from state.manual + state.members
- 03-personal-explanation.txt — explanation from state.manual.explanation + members
- 04-evidence-index.txt — state.evidence array with name/type/size
- 05-form-i131-guide.txt — Item 1.e, Ukraine RE-PAROLE, edition, program status
- 06-filing-instructions.txt — branches: mail vs online vs unsure
- 07-document-checklist.txt — vaccines, TB IGRA, I-94, photos, I-912, EAD warning
- 08-fees-and-links.txt — two-fee structure, feecalculator, g-1055, I-912, processing-times
- 09-disclaimer.txt — not legal advice, not affiliated with USCIS, consult attorney

WizardStateJson interface expanded: manual, evidence, members with full fields.

### 3J. Rate Limiting Build Warning — Already Clean
The `rate-limit.ts` uses `require('@upstash/ratelimit')` with try/catch fallback — compiles cleanly without the package installed. No build warning. No changes needed.

### 3K. ES FAQ Columns + 12 FAQ Entries — NEW, Complete
`supabase/migrations/20260504000001_canonical_answers_es_and_faq.sql`:
- Adds `question_es`, `answer_es` columns to canonical_answers
- Seeds 12 re-parole FAQ entries in all 4 locales (EN/ES/UK/RU):
  1. What is U4U Re-Parole?
  2. When can I apply?
  3. What form do I need?
  4. What does "Ukraine RE-PAROLE" mean?
  5. Correct form item (1.e, not 10.C)?
  6. What are the USCIS fees?
  7. Is fee waiver available?
  8. What medical documentation is required?
  9. When can I apply for EAD?
  10. How long does processing take?
  11. Where can I get legal help?
  12. Is the U4U program currently active?

### 3L. Audit Log — Complete
- `audit_log` insert uses event `'packet_generated'` (not 'packet.generated')
- includes session_id, storage_key, filing_method, file_count, locale, service_slug
- `generated_packets` table logged (fire-and-forget, tolerates missing table)

---

## Evidence

### TypeScript
```
pnpm --filter web typecheck
✓ PASS (0 errors)
```

### Build
```
pnpm --filter web build
✓ PASS — all 48 static pages built, no errors
```

### CI Guards (local)
```
10.C/10.G in service files: 0 user-facing hits (comments only, with "eliminated"/"ELIMINATED")
Hardcoded fees ($580/$630/$1020): 0 hits
Risk language (high risk / AI lawyer): 0 hits
DeepSeek in client: 0 hits
```

### Files Changed
| File | Change |
|------|--------|
| `apps/web/src/data/serviceData/re-parole-u4u.ts` | Item 1.e, medical/EAD/feeWaiver keys, fee_waiver_url |
| `apps/web/src/data/serviceData/types.ts` | 6 new optional fields, fee_waiver_url |
| `apps/web/messages/en.json` | 6 new notice keys, item 1.e, fees/processing updated |
| `apps/web/messages/es.json` | 6 new notice keys + translations |
| `apps/web/messages/ru.json` | 6 new notice keys + translations |
| `apps/web/messages/uk.json` | 6 new notice keys + translations |
| `apps/web/src/app/[locale]/services/[slug]/page.tsx` | Amber banner with 6 notices |
| `apps/web/src/app/api/packet/generate/route.ts` | Complete rewrite → 9-file structured ZIP |
| `supabase/migrations/20260504000001_canonical_answers_es_and_faq.sql` | ES columns + 12 FAQ |

---

## Remaining Limitations

1. **Packet generation is server-side only** — actual Supabase Storage upload requires live env vars (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL). Local E2E test requires running dev server with these env vars.

2. **generated_packets table** — currently logged with fire-and-forget, silently ignores "table does not exist" errors. If this table is needed in production, a migration should be created (not done here to avoid schema assumptions).

3. **Banner labels are hardcoded in English** (e.g., "Program status: ", "Medical documentation: ") in the page.tsx JSX. These prefix labels should ideally come from message keys if full i18n is needed. For now, the content strings are fully translated.

4. **OCR honest label** was already correct in main — no regression verified but not E2E tested.

5. **I-131 online filing instructions** for the re-parole question ("Yes" to re-parole question) — this is based on Taras's personal verification, not linkable to a static URL since myUSCIS.gov is a dynamic portal.

---

## Recommendation

1. **Merge this branch (stage-4-fix-critical-u4u) as the definitive fix.** It supersedes PR #14.
2. **Close PR #14** (fix/critical-audit-gaps) — its changes are a subset of this branch.
3. **Apply migration** `20260504000001_canonical_answers_es_and_faq.sql` to production Supabase after merge.
4. **Verify live** the amber banner renders correctly on /en/services/re-parole-u4u after deploy.
5. **Next priority**: packet download E2E in staging environment (requires live Supabase Storage bucket).
