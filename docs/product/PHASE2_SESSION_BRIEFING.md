# TPS Robot — Phase 2 Session Briefing
## For: Claude (principal execution agent / co-founder mode)

---

## 1. WHO YOU ARE AND YOUR ROLE

You are the **principal execution agent** for Messenginfo — not an assistant, not an advisor.
You operate in **co-founder mode**: strategist + engineer + implementer + auditor.

### Your operating rules (non-negotiable):
- **Never flatter, never agree as default.** Always tell harsh truth.
- **Root cause over cosmetics.** Result over explanation. Best path, not first path.
- **Think 2-3 steps ahead.** Separate facts from hypotheses.
- **No "impossible" without checking all paths.** If blocked, find alternative.
- **No DONE without raw evidence.** No assumptions. No fake success.
- **Every claim must be verified** — local + CI + deploy + live diagnostic.
- **Format:** Goal → Known → Unconfirmed → Solution → Steps → Bottlenecks → Risks → Next action.

### Your verification chain (mandatory for every code change):
1. `git status` before/after
2. TypeScript check (`npx tsc --noEmit`)
3. Build (`npx next build`)
4. Tests (`npx vitest run` or targeted)
5. Commit + push
6. GitHub Actions CI: `gh run list --workflow=guards.yml` → wait → verify run_url + conclusion + test count
7. Vercel deployment: verify READY + live SHA matches commit
8. Production diagnostic: 4 owner docs through `/api/tps/ocr/extract`

---

## 2. THE PRODUCT — WHAT MESSENGINFO IS

**Messenginfo** is a **document-to-form robot** for Ukrainian immigrants in the US.

### Core product principle (saved in memory):
> User uploads documents → AI extracts/routes/validates → generates I-821/I-765/ZIP package.
> Zero manual entry is the goal; user only does surface review.
> If this doesn't work, the product has no value.

### The robot pipeline:
```
upload documents
  → detect document type
  → OCR (Google Cloud Vision)
  → document-specific rule parser extracts fields
  → AI Brain (DeepSeek) normalizes from evidence only
  → slot firewall routes allowed fields
  → confidence engine marks review_needed
  → form mapper fills I-821/I-765
  → PDF generator outputs forms
  → ZIP builder outputs package
  → user reviews surface data only
```

### Target forms:
- **I-821** — TPS application (edition 01/20/25)
- **I-765** — Employment Authorization / EAD (edition 08/21/25)

### Business entity:
- SK Logistics LLC, Los Angeles, CA
- Site: messenginfo.com
- Repo: `owner-sudo/uscis-helper` (private GitHub)
- Deploy: Vercel, project `prj_G5Bwd5VMDqEMdbPKLlQW50aF3pQq`
- Team: `team_qRGWLc9kKWuiKWouVsOeO1P4`

---

## 3. WHAT WAS DONE IN THE PREVIOUS SESSION

### Commits (all verified with CI):

| SHA | Change | CI Tests |
|-----|--------|----------|
| `45aa73d` | maxTokens 800→2500 in defaultChat — Brain was getting truncated JSON | pre-CI |
| `ca17aa0` | parseDate: YYYY Month DD + Month DD, YYYY — I-94 dates stopped dropping | pre-CI |
| `c34ced9` | Targeted Brain fill for passport missing fields | pre-CI |
| `611c01e` | CI: added `pnpm --filter web test` + poppler-utils to guards.yml | 1883/1883 |
| `58e9b10` | Systematic PDF field readback tests (AcroForm verification) | 1885/1885 |
| `5e54e72` | Phase 1 provenance sidecar — types, factories, audit rows | 1896/1896 |

### Current production state (deploy SHA `5e54e72`):

| Document | Fields | Brain | Status |
|----------|--------|-------|--------|
| Passport | 9 | targeted (country_of_birth added) | middle_name missing (doc limitation) |
| I-94 | 9 | ran via threshold (+7 fields) | dob + last_entry_date fixed |
| EAD | 8 | ran via threshold (+8 fields) | stable |
| DL | 13 | skipped (rule sufficient) | stable |

### What is proven:
- OCR extraction works for 4 document types
- Brain fills gaps with correct maxTokens (2500)
- Date parser handles CBP I-94 formats
- Targeted Brain fill adds passport fields from visual zone
- PDF generation: I-821 + I-765 with correct edition stamps
- **Systematic AcroForm readback: 0 mismatches** (not spot-checks — every mapped text field)
- CI runs full suite: 49 files, 1896 tests, poppler/pdftotext locked
- Provenance Phase 1 sidecar: types + factories + audit rows + 11 tests

---

## 4. WHAT NEEDS TO BE DONE NOW — PHASE 2

### Task ID: `TPS_PROVENANCE_PHASE_2_WIZARD_STATE`
### Priority: P0

### The problem:
```
OCR → TpsExtractedField[] (HAS provenance: source, method, confidence)
  ↓ wizard applies to state
TPSAnswers (flat object, provenance LOST)
  ↓ buildI821Ops / buildI765Ops
PDF ops → PDF generation
```

TPSAnswers is a flat `{ family_name: string, dob: string, ... }`.
When OCR extracts `family_name` from passport MRZ with confidence 0.95,
that provenance disappears when the value enters TPSAnswers.

### The solution (incremental, no big-bang):

1. **Find the conversion point** — locate where `TpsExtractedField[]` becomes flat `TPSAnswers`
   - Likely in the wizard component or an API handler
   - Search for: `handleUpload`, `applyPreExtracted`, or wherever extraction results flow into wizard state

2. **Add ProvenanceMap as parallel state** — alongside `answers: TPSAnswers`, add `provenanceByField: ProvenanceMap`
   - Use existing types from `apps/web/src/lib/tps/provenance.ts`
   - Each extracted field creates a provenance record via `ocrProvenance()` factory
   - User edits change provenance via `manualProvenance(true)` (corrected)

3. **Keep flat TPSAnswers compatibility** — `buildPacket()` still receives flat `TPSAnswers`
   - Do NOT rewrite packetBuilder
   - ProvenanceMap travels alongside but does not replace flat answers

4. **Wire audit rows into packet generation** — when `buildI821Ops`/`buildI765Ops` run,
   generate `PdfAuditRow[]` using `buildAuditRows()` from provenance.ts

5. **Test the full chain** — extraction → provenance → flat adapter → PDF → readback + audit

### Implementation constraints:
- No big-bang rewrite of wizard
- No removal of flat TPSAnswers
- No raw PII in logs/audit output
- No auto-filled field without provenance
- Existing 1896 CI tests must remain green
- Systematic PDF readback tests must remain green

---

## 5. KEY FILE PATHS

### Monorepo root:
`/Users/sergiiivanenko/work/uscis-helper/`

### OCR pipeline:
- OCR route: `apps/web/src/app/api/tps/ocr/extract/route.ts` (739 lines)
- Brain layer: `apps/web/src/lib/tps/ai/documentBrain.ts` (851 lines)
- DeepSeek client: `apps/web/src/lib/deepseek/client.ts` (159 lines)
- Document modules: `apps/web/src/lib/tps/modules/` (passport.ts, passportBooklet.ts, i94.ts, ead.ts, dl.ts)
- Document contracts: `apps/web/src/lib/tps/ocr/documentContracts.ts`
- Shape-debug: `apps/web/src/app/api/tps/ocr/shape-debug/route.ts`

### Packet generation:
- Packet builder: `apps/web/src/lib/tps/packetBuilder.ts` (262 lines)
- PDF prefiller: `apps/web/src/lib/tps/pdfPrefiller.ts` (221 lines)
- I-821 field map: `apps/web/src/lib/tps/forms/i821FieldMap.ts` (338 lines)
- I-765 field map: `apps/web/src/lib/tps/forms/i765FieldMap.ts`
- Answers type: `apps/web/src/lib/tps/answers.ts` (238 lines)

### Provenance (Phase 1 — already built):
- Types + factories + audit: `apps/web/src/lib/tps/provenance.ts` (224 lines)
- Tests: `apps/web/src/lib/tps/__tests__/provenance.test.ts` (129 lines)

### Tests:
- Brain tests: `apps/web/src/lib/tps/ai/__tests__/documentBrain.test.ts` (437 lines, 44 tests)
- Packet builder tests: `apps/web/src/lib/tps/__tests__/packetBuilder.test.ts` (366 lines, 9 tests)
- Strict validators: `apps/web/src/lib/tps/__tests__/strictValidators.test.ts` (31 tests)
- All TPS tests: `apps/web/src/lib/tps/` (11 files, 140 tests)

### Wizard (where provenance needs to be wired):
- TPS wizard component: search for `TPSWizardV2` in `apps/web/src/`
- Packet generation API: `apps/web/src/app/api/tps/generate-packet/`

### CI:
- GitHub Actions workflow: `.github/workflows/guards.yml`

### Owner test documents (for production diagnostic):
- Passport: `qa-shots/private/Passport Taras Ivanenko .jpg`
- I-94: `qa-shots/private/I94 Taras Ivanenko .jpg`
- EAD: `qa-shots/private/Ead1.jpg`
- DL: `qa-shots/private/DL.jpg`

---

## 6. ENVIRONMENT

### MacBook:
- Node: v24.11.1 at `~/.nvm/versions/node/v24.11.1/bin`
- pnpm: via Node
- Homebrew: `/opt/homebrew/bin/` (has `gh`, `pdftotext`, `brew`)
- PATH for commands: `export PATH="/opt/homebrew/bin:/Users/sergiiivanenko/.nvm/versions/node/v24.11.1/bin:$PATH"`

### CI (GitHub Actions):
- Ubuntu-latest, Node 22, pnpm
- poppler-utils installed via apt-get (pdftotext 24.02.0)
- Workflow: `guards.yml` — typecheck + build + all tests on push/PR to main

### Deploy:
- Vercel auto-deploy from GitHub push to main
- Verify: `Vercel:get_deployment` or `Vercel:list_deployments`

---

## 7. DIAGNOSTIC SCRIPTS

### OCR diagnostic (4 owner docs, structural metrics only):
```javascript
// Save as /tmp/ocr-diag.mjs and run with:
// node /tmp/ocr-diag.mjs
import { readFile } from 'fs/promises';
const docs = [
  { file: 'qa-shots/private/Passport Taras Ivanenko .jpg', hint: 'passport', label: 'Passport' },
  { file: 'qa-shots/private/I94 Taras Ivanenko .jpg', hint: 'i94', label: 'I-94' },
  { file: 'qa-shots/private/Ead1.jpg', hint: 'ead', label: 'EAD' },
  { file: 'qa-shots/private/DL.jpg', hint: 'dl', label: 'DL' },
];
for (const d of docs) {
  const buf = await readFile(d.file);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'image/jpeg' }), 'doc.jpg');
  form.append('docHint', d.hint);
  const res = await fetch('https://messenginfo.com/api/tps/ocr/extract', { method: 'POST', body: form });
  const j = await res.json();
  console.log(`\n=== ${d.label} ===`);
  console.log('final_field_count:', j.final_field_count);
  console.log('brain_status:', j.brain_status);
  console.log('brain_trigger:', j.brain_trigger);
  console.log('brain_validated_skipped:', j.brain?.validated_skipped?.length ?? 0);
}
```

---

## 8. HARD RULES — NEVER VIOLATE

1. **No raw PII in logs/output.** Use masked values, field names, structural metrics only.
2. **No AI guessing.** No field without OCR/source evidence.
3. **No forbidden cross-slot mapping.** Passport → A-number = blocked. DL → immigration status = blocked.
4. **No global threshold lowering.** Use targeted Brain fill instead.
5. **No temporary workarounds.** Fix root cause or mark as documented limitation.
6. **No DONE without evidence chain.** Local tests + CI run_url + Vercel READY + live SHA.
7. **No touching payment/billing.**
8. **No weakening validation globally.**

---

## 9. RISKS AND CONTROL

| Risk | Control |
|------|---------|
| Phase 2 breaks wizard | Sidecar parallel state, flat adapter, no TPSAnswers removal |
| CI green but tests not actually run | Verify exact test count in CI logs |
| PDF readback silently returns empty | pdftotext locked in CI; test fails hard on missing binary |
| Provenance map exists but not used | Audit rows must link canonical_field → pdf_field → provenance |
| Agent claims DONE from local only | PASS requires CI run_url + deploy READY + live SHA |
| AI fills field without source evidence | No OCR evidence = no autofill. System default marked explicitly |
| USCIS form edition changes | Edition stamp tests catch silently broken forms |

---

## 10. DEFINITION OF DONE FOR PHASE 2

### PASS:
- Provenance preserved from TpsExtractedField → wizard state → ProvenanceMap
- User edits tracked as `user_manual_reviewed` / `corrected`
- Flat TPSAnswers adapter works (buildPacket unchanged)
- Audit rows generated during packet build
- All existing tests green (1896+ in CI)
- Systematic PDF readback regression passes
- CI run_url provided with success conclusion
- Vercel READY with matching SHA

### DEGRADED:
- Sidecar works but not yet wired into production packet generation (audit rows generated in tests but not in live flow)

### FAIL:
- Any PDF field lacks provenance and is not explicitly marked manual
- Existing tests broken
- Raw PII in output
- CI not verified

---

## 11. FULL ROADMAP AFTER PHASE 2

| Priority | Task | Status |
|----------|------|--------|
| P0 | Phase 2: wizard provenance state | NEXT |
| P0 | Phase 3: audit rows in live packet generation | after Phase 2 |
| P1 | passport middle_name investigation | inspect OCR text for patronymic |
| P1 | I-94 rule module upgrade (latency 5.5s → ~1s) | reduce Brain dependency |
| P1 | Checkbox/radio systematic readback | extend coverage |
| P2 | Real-doc end-to-end automated test | full owner-doc flow |
| P2 | Production audit report per packet | masked provenance report in ZIP |

---

## 12. HOW TO START THE SESSION

Paste this briefing document into the new chat, then say:

> Read `/Users/sergiiivanenko/work/uscis-helper/docs/product/PHASE2_SESSION_BRIEFING.md`
> and start TPS_PROVENANCE_PHASE_2_WIZARD_STATE.
> First action: find where TpsExtractedField[] converts to flat TPSAnswers.
> Verify CI is green for current HEAD before making any changes.

The agent should:
1. Read the briefing
2. Verify current HEAD SHA and CI status
3. Find the conversion point (search for `handleUpload`, `applyPreExtracted`, or similar in wizard)
4. Read existing provenance.ts to understand Phase 1 types
5. Implement sidecar ProvenanceMap alongside TPSAnswers
6. Add tests
7. Run full gates
8. Report with evidence

---

*Generated 2026-05-22 by Claude during TPS OCR/Brain fix sprint.*
*Previous session transcript: `/mnt/transcripts/2026-05-22-07-34-27-messenginfo-tps-ocr-maxtoken-fix.txt`*
