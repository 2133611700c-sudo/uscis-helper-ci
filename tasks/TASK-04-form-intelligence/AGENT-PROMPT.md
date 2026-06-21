# AGENT PROMPT — TASK-04 Form Intelligence

You are Claude Code working in `/Users/sergiiivanenko/work/uscis-helper`.

## STEP 0 — READ CONTEXT

1. `context/PROJECT-STATE.md`
2. `data/target-forms.csv`
3. `data/critical-fields-checklist.md`
4. `data/common-mistakes-by-form.md`
5. `data/types.ts.template`
6. `output-spec/FORM-FILE-TEMPLATE.ts`
7. `output-spec/FORM-SPEC-TEMPLATE.md`
8. `output-spec/FINAL-REPORT-TEMPLATE.md`

## STEP 1 — VERIFY ENVIRONMENT

```bash
cd /Users/sergiiivanenko/work/uscis-helper
git status
git checkout -b form-intelligence-$(date +%Y%m%d-%H%M)
```

Wave 1A must be live (verify `apps/web/data/serviceCards.ts` exists and has 12 entries).

## STEP 2 — CREATE SHARED TYPES

```bash
mkdir -p apps/web/data/formIntelligence
cp data/types.ts.template apps/web/data/formIntelligence/types.ts
mkdir -p docs/forms
mkdir -p docs/reports
```

```bash
pnpm --filter web typecheck
```

Must pass.

## STEP 3 — PROCESS FORMS ONE AT A TIME

For each row in `data/target-forms.csv`:

### 3.1 Fetch official form page

```bash
curl -L -o /tmp/{slug}-page.html https://www.uscis.gov/{form_slug}
```

If 403 / blocked, use `web_fetch` tool instead.

Extract from HTML:
- Form PDF download link
- Instructions PDF download link
- Filing fee mentioned on page
- "Edition" date

### 3.2 Download PDFs

```bash
curl -L -o /tmp/{slug}-form.pdf {form_pdf_url}
curl -L -o /tmp/{slug}-instructions.pdf {instructions_pdf_url}
```

Verify file size > 10 KB and < 20 MB. If outside range, log error.

### 3.3 Extract structured data

Use Python with `pdfplumber` or similar (install if needed: `pip install pdfplumber --break-system-packages`):

For each PDF, extract:
- Edition date (header — look for `Edition MM/DD/YY`)
- Filing fee (from instructions, "What is the Filing Fee" section)
- All fields with their labels and section numbers (e.g. "Part 1, Item 1.a")
- Required initial evidence (instructions section "What Initial Evidence Is Required")
- Filing method (online vs paper, from "How to File" section)

### 3.4 Map fields to source documents

For each field, classify `source_type` per `data/critical-fields-checklist.md`:
- Names, DOB, gender → `passport`
- I-94 number, class of admission → `i94`
- EAD card number, category → `ead`
- A-number → `ead` or `uscis_notice` (note ambiguity)
- Receipt number → `uscis_notice`
- Physical descriptors (height, weight, eye color, hair color) → `manual_entry`
- Address history → `manual_entry`
- SSN → `manual_entry` (with sensitivity flag)

### 3.5 Generate TS file

Write to `apps/web/data/formIntelligence/{slug}.ts` per `output-spec/FORM-FILE-TEMPLATE.ts`.

### 3.6 Generate MD spec

Write to `docs/forms/{slug}.md` per `output-spec/FORM-SPEC-TEMPLATE.md`.

### 3.7 HEAD check official URLs

For each `official_url` and `instructions_pdf_url`:
```bash
curl -sI {url} | head -1
```

Log dead links to `/tmp/form-intel-dead-links.txt`.

### 3.8 Verify TypeScript compiles

```bash
pnpm --filter web typecheck
```

Must pass before next form. If fails, fix this form's file before continuing.

### 3.9 STOP and report

Output: "Form {form_id} done. TS: {path}. MD: {path}. Field count: {N}. Edition: {date}. Awaiting user 'next' to continue."

Do NOT proceed without "next" instruction.

## STEP 4 — AFTER ALL 7 FORMS

Verify cross-form consistency:

```bash
# All forms should have edition_last_verified set to today
grep -E "edition_last_verified.*'" apps/web/data/formIntelligence/*.ts
```

Cross-reference all `official_url` values against `apps/web/data/serviceCards.ts` `officialSourceUrl` — flag any mismatches as "Wave 1A drift" (form intel says one URL, service card says another).

## STEP 5 — COMMIT + REPORT

```bash
git add apps/web/data/formIntelligence/ docs/forms/ docs/reports/
git status
git commit -m "feat(forms): form intelligence for I-131, I-765, I-821, I-912, G-1145, AR-11, I-589"
git push -u origin HEAD
```

Write final report to `docs/reports/form-intelligence-report.md` per `output-spec/FINAL-REPORT-TEMPLATE.md`.

## CONSTRAINTS

- USCIS PDF download fails → STOP, ask user (rate limit possible)
- Edition date can't be extracted → log `edition_date_unknown`, continue
- Form has 0 extractable fields → STOP, manual review needed
- Fee discrepancy > $50 vs G-1055 → STOP, flag for user
- NO verbatim USCIS PDF text in published files (paraphrase + cite)
- NO modifications to apps/web/components or apps/web/app (this task is data-only)
- NO modifications to live serviceCards.ts (only flag mismatches)

## EXECUTE NOW — START WITH I-131.
