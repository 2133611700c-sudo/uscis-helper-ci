# Messenginfo Project Reality Audit

Generated: 2026-05-01T22:21Z  
Branch: fix-uscis-news-monitoring-task06 (PR #3 merged to main)  
Commit (local HEAD): f8c1915  
Commit (main, remote): includes PR #3 merge  
Auditor: Agent (TASK-00)

---

## Executive Summary

The Messenginfo web app is **live at messenginfo.com** with a full service-card homepage, 4 locales (en/ru/uk/es), 12 service pages, legal pages, and a typecheck-clean codebase. Data layer (35 pain points, 15 misinformation, 120 FAQs, i131 form intelligence) is complete. Monitoring engine (5 GHA workflows, 26 sources, 182 alerts) is fully operational. **The single biggest blocker is the translation flow**: the UI exists (document picker → upload box → draft placeholder) but has zero backend — no OCR, no `translation_orders` Supabase table, no PDF output. No interactive tool wizards exist (no `/tools/` routes — only static `/services/[slug]` info pages). All form intelligence files except i131 are stubs.

---

## Reality Matrix

| Area | Target State | Current State | Evidence | Status |
|---|---|---|---|---|
| Public brand | Messenginfo only | 44 Messenginfo hits in rendered HTML; "USCIS Helper" 0 hits in visible UI | `grep -R "USCIS Helper" apps/web/src` → 0 results | ✅ PASS |
| Homepage | Service hub with action cards | ServiceCardGrid + Hero + TrendingTopicsBar + OfficialSourcesStrip + DocumentToolsSection + TelegramStrip + DisclaimerSection | `apps/web/src/app/[locale]/page.tsx` | ✅ PASS |
| Translate Document flow | Upload → OCR → review → PDF | UI implemented (DocumentTypeGrid → upload box → DraftResultPlaceholder); NO backend (no OCR API, no Supabase table) | TranslationServiceExperience.tsx exists; `translation_orders` returns null in Supabase | ❌ FAIL |
| Re-Parole flow | Readiness checklist + draft helper | Static info page at `/services/re-parole-u4u`; no wizard/checklist | `src/app/[locale]/services/[slug]/page.tsx` SLUG list includes `re-parole-u4u` | ⚠️ PARTIAL |
| TPS/EAD checker | Date/category checker | Static info page at `/services/tps-ukraine` and `/services/ead-work-permit` | Same slug route | ⚠️ PARTIAL |
| I-94 helper | Lookup/explainer | Static info page at `/services/i-94` | Same slug route | ⚠️ PARTIAL |
| Case Status | Receipt/status helper | CaseStatusChecker component on homepage + static `/services/uscis-case-status` page | `src/components/home/CaseStatusChecker.tsx` | ⚠️ PARTIAL |
| RFE/Denial router | High-risk summary + attorney warning | Static info page at `/services/rfe-denial`; marked `risk: 'high'` | serviceCards.ts slug rfe-denial | ⚠️ PARTIAL |
| Legal pages | privacy/terms/disclaimer EN/RU/UK/ES | All 4 present, 200 OK in production | `curl https://messenginfo.com/en/privacy` → 200 | ✅ PASS |
| i18n | en/ru/uk/es | 4 locales in routing.ts; 4 message JSON files; /en /ru /uk /es all 200 in production | routing.ts + curl checks | ✅ PASS |
| Pain DB | 35 entries | 35 entries | `grep -c 'id:' painPoints.ts` = 35 | ✅ PASS |
| Misinfo DB | 15 entries | 15 entries | `grep -c 'id:' misinformation.ts` = 15 | ✅ PASS |
| FAQ DB | 120 entries (30×4 langs) | 120 entries: 30 EN + 30 RU + 30 UK + 30 ES | `grep -c "language: 'en'"` = 30 × 4 | ✅ PASS |
| I-131 intelligence | Implemented | 31KB, 66 entries, full field-level intelligence | `apps/web/src/data/formIntelligence/i131.ts` | ✅ PASS |
| Other form intelligence | I-765/I-821/I-912/AR-11/G-1145/I-589 | Stubs: each ~600–1000 bytes, minimal metadata only | file sizes: i765.ts 987B, i821.ts 963B | ⚠️ PARTIAL |
| Monitoring engine | Sources + alerts + 5 workflows | 26 sources, 182 alerts, 5 workflows all active+success | GH Actions + Supabase audit | ✅ PASS |
| Supabase | Required tables live | monitoring/audit_log tables live; translation_orders/source_checks null | Supabase query results | ⚠️ PARTIAL |
| Vercel production | messenginfo.com live | Live, all 4 locales 200, sitemap/robots 200 | curl HTTP checks | ✅ PASS |
| GitHub workflows | CI/monitors active | 5 workflows active, last 13 runs all success | `gh run list` | ✅ PASS |
| NotebookLM cleanup | Clean source base | TASK-01 folder has prompts/data, no final report | tasks/TASK-01-notebooklm-cleanup/ | ❌ NO REPORT |
| Old prompts/docs | Deduped/current | MASTER-PROMPT-v2.md exists; 50+ source-monitoring docs; no 00-MASTER-ROADMAP style files | docs/research/source-monitoring/ | ⚠️ PARTIAL |

---

## What Is Actually Done

- **Production live**: messenginfo.com up, en/ru/uk/es all 200, www redirect working
- **Homepage**: Full service hub — 12 card grid, hero, official sources strip, document tools widget, Telegram strip, disclaimer section
- **All content pages**: `/about`, `/faq`, `/contact`, `/privacy`, `/terms`, `/disclaimer` — all localized, all live
- **Service detail pages**: 12 static service info pages via `/[locale]/services/[slug]`
- **Translate Document UI**: Document type picker + upload box + draft placeholder — UI is complete
- **Data layer complete**: 35 pain points, 15 misinformation, 120 FAQs (4 languages), serviceCards, officialSources, trendingTopics, translationDocuments
- **I-131 form intelligence**: 31KB, 66 data entries — full implementation
- **Monitoring engine**: 5 GHA workflows (USCIS RSS, USCIS page scraper, YouTube, Federal Register, Dead Links, Form Editions), 26 sources, 182 alerts, all `last_checked_at` populated
- **Typecheck**: PASSES cleanly
- **Brand safety**: 0 "USCIS Helper" in visible UI; "not a law firm" disclaimer in about + manifest
- **i18n routing**: 4 locales wired, messages JSON present for all 4
- **Supabase schema**: monitoring_sources, monitoring_alerts, form_editions, dead_links_log, profiles, form_sessions, form_answers, audit_log all exist

---

## What Is Not Done

- **Translation backend**: No OCR API route, no `translation_orders` functional table, no PDF generation — the upload UI leads nowhere
- **Interactive tool wizards**: No `/tools/` routes exist; `/services/[slug]` pages are info-only (no form wizard, no checklist wizard, no guided flow)
- **Form intelligence for 6 forms**: i765, i821, i912, ar11, g1145, i589 are stubs (metadata only, no field-level intelligence)
- **Contact form backend**: `_actions/contact.ts` exists but no Supabase `contact_submissions` table or email dispatch visible
- **TASK-01 final report**: No report in docs/reports/ — only prompt + data files
- **TASK-02 final report**: No report in docs/reports/
- **TASK-03 final report**: No report in docs/reports/
- **TASK-04 final report**: No report in docs/reports/ (pain-misinfo-faq-report.md covers TASK-05, not TASK-04)
- **TASK-05 not merged to main**: Branch `pain-misinfo-faq-20260430-2242` was the source; production is live but confirm merge state
- **MiaFloatingWidget**: Component exists (`MiaFloatingWidget.tsx`) but unclear if connected to any AI endpoint
- **ES language content**: messages/es.json exists but RU/UK versions of many components may not be fully translated (needs UX audit)
- **`/api/health` publicly blocked**: Returns 404 without `x-health-token` header — useful for infra monitoring but inaccessible without key

---

## What Is Broken

- **`translation_orders` Supabase table**: Returns `null` count (table does not exist in schema or is outside anon/service_role RLS). The translation UI is live but non-functional end-to-end.
- **`source_checks` Supabase table**: Returns `null` — not in schema, referenced in spec but never created
- **`fix-uscis-news-monitoring-task06` not merged to main locally**: Local `main` is at `90e5f34` (YouTube fix). PR #3 was merged remotely but local git hasn't fetched. Dirty state with untracked `tsconfig.tsbuildinfo`.
- **Vim swap file conflict**: `.claims-verification-table.md.swp` — PID 51375 is an ACTIVE Vim session editing this file. Do not touch.

---

## What Is Duplicated / Conflicting

- `docs/archive/old-messenginfo-audit.md` + `docs/archive/old-messenginfo-final-state.json` — stale, predates current build
- `docs/audit/2026-04-29-handy-messenginfo-audit.md` + `docs/audit/2026-04-30-messenginfo-vs-handy-ux-audit.md` — mix of HF and Messenginfo concerns; partially obsolete
- `docs/research/source-monitoring/` — 50+ files, active research corpus but no single consolidated "current source registry" — `master-source-registry.md` and `uscis-helper-master-source-registry.md` both exist (potential conflict)
- `NEXT-SESSION-ACTION-PLAN.md` — likely stale, superseded by TASK-00 audit
- `docs/reports/monitoring-engine-report.md` — sections 7 (PARTIAL), 9 (DONE), 11 (COMPLETE) all coexist in same file — redundant; section 11 is canonical
- `tasks/TASK-02-wave-1a-build/data/service-cards.ts.template` vs `apps/web/src/data/serviceCards.ts` — template is now superseded by actual implementation

---

## Recommended Next 3 Tasks

### 1. TASK-07 — Translation Backend (Highest Priority)
**Goal**: Wire the translation upload → OCR → draft → output pipeline  
**Why now**: The product's core value proposition (document help) has a live UI but zero backend. Users who land on `/services/translate-document` hit a dead end.  
**Files to touch**:
- Create Supabase migration: `translation_orders` table (id, session_id, document_type, upload_path, ocr_text, draft_text, status, created_at)
- Create `/api/translation/upload` route in `apps/web/src/app/api/`
- Wire `DocumentUploadBox.tsx` to POST to that route
- Create draft generation logic in `TranslationServiceExperience.tsx`
- Create `DraftResultPlaceholder.tsx` real content (it's currently a placeholder component)  
**Verification gate**: Upload a passport image → get a structured draft output → Supabase row created in `translation_orders`  
**Hard stops**: Do not integrate paid OCR without cost analysis; do not store PII without clear retention policy

### 2. TASK-08 — Form Intelligence Stubs → Full (Second Priority)
**Goal**: Complete form intelligence for I-765, I-821, I-912 (the 3 most-used besides I-131)  
**Why now**: Service pages for ead-work-permit, tps-ukraine exist and reference form intelligence. i765.ts is a 987-byte stub. Pain points database references I-765 50+ times. Data is there to populate it.  
**Files to touch**:
- `apps/web/src/data/formIntelligence/i765.ts` — expand to full field-level (like i131.ts pattern)
- `apps/web/src/data/formIntelligence/i821.ts`
- `apps/web/src/data/formIntelligence/i912.ts`
- Wire service pages to consume form intelligence data  
**Verification gate**: `grep -c "id:" apps/web/src/data/formIntelligence/i765.ts` ≥ 20 entries; typecheck passes  
**Hard stops**: No hardcoded fee amounts; all fields must link to official source URL

### 3. TASK-09 — Merge cleanup + `main` sync (Third Priority)
**Goal**: Get local repo and main branch clean, merge `fix-uscis-news-monitoring-task06` fully  
**Why now**: Local main is behind remote (PR #3 not fetched). `tsconfig.tsbuildinfo` is dirty-tracked. Vim swap file in research docs. Branch hygiene blocks next agent pickup.  
**Files to touch**:
- `git fetch && git checkout main && git pull` — sync local main
- Remove stale branch `fix-uscis-news-monitoring-task06` after confirming merge
- Add `apps/web/tsconfig.tsbuildinfo` to `.gitignore` or reset it
- Consolidate `master-source-registry.md` vs `uscis-helper-master-source-registry.md`  
**Verification gate**: `git status` on main is clean; `git log --oneline -3` shows PR #3 merge  
**Hard stops**: Do not force-push main; do not delete research docs

---

## Risk Register

| Risk | Severity | Evidence | Control |
|---|---|---|---|
| Translation UI with no backend — user uploads real document, nothing happens | HIGH | `translation_orders` returns null in Supabase; no API route exists | Add clear "coming soon" gate or implement backend before promoting feature |
| `translation_orders` missing from schema — if app code tries to insert, will throw PGRST205 | HIGH | Supabase null count on table | Create migration before any production flow |
| Vim swap file conflict on claims-verification-table.md — data loss if saved incorrectly | MEDIUM | PID 51375 active, `.swp` file exists | Do not touch until Vim session resolved by user |
| Local main behind remote — dev work on stale base | MEDIUM | `git log main` shows `90e5f34`, PR #3 already merged remotely | `git fetch && git pull` before starting next task |
| Form intelligence stubs referenced by live pages — service pages for TPS/EAD look incomplete | MEDIUM | i765.ts 987 bytes vs i131.ts 31KB | TASK-08 |
| No contact form backend — users who submit contact form get no response | MEDIUM | `_actions/contact.ts` exists but no email/Supabase destination confirmed | Audit contact.ts and verify Resend or Supabase insertion |
| 50+ source-monitoring docs with no single canonical registry | LOW | Two "master" registry files coexist | Consolidate in TASK-09 cleanup |
| MiaFloatingWidget not connected to backend | LOW | Component exists, no API endpoint visible | Decide: remove from UI or wire to LLM endpoint |

---

## Appendix — Evidence Files

- `/tmp/messenginfo-audit-00-git.txt` — git state
- `/tmp/messenginfo-audit-01-files.txt` — full file inventory
- `/tmp/messenginfo-audit-02-build.txt` — package scripts + typecheck result
- `/tmp/messenginfo-audit-03-ui.txt` — brand/UI grep audit
- `/tmp/messenginfo-audit-04-routes.txt` — route file listing
- `/tmp/messenginfo-audit-05-data.txt` — data file sizes + entry counts
- `/tmp/messenginfo-audit-06-docs.txt` — docs/tasks inventory
- `/tmp/messenginfo-audit-07-github.txt` — GH Actions runs + workflow list
- `/tmp/messenginfo-audit-08-production.txt` — HTTP checks + rendered brand check
- `/tmp/messenginfo-audit-09-supabase.txt` — table counts by name
- `/tmp/messenginfo-audit-10-prompts.txt` — prompt/doc alignment
