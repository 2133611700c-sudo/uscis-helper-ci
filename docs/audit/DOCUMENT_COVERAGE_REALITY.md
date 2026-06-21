# DOCUMENT_COVERAGE_REALITY.md — Audit Agent 3

Base commit: `02eb595` (worktree of `audit/full-project-reality-2026-06-14`). Read-only.
PII policy: opaque ids + 12-char hash prefixes only. No applicant values.

## TL;DR
The product's document-intelligence coverage is **synthetic-and-claimed**, not proven on real
sealed documents inside the repo. The headline "**0 fabricated critical fields**" benchmark
(PR #128) is a **local-dev run against ABSENT private fixtures**, not a CI gate, not staging,
not production, and covers a 3-doc subset where most critical fields are reported `EMPTY`
(i.e. *not read* — not *verified read*). Status: **PROVEN_LOCAL (narrow) / UNVERIFIED (broad)**.

## What physically exists in the repo (PRIMARY SOURCE)
| Class | Repo evidence | Real samples in repo | GT in repo | Benchmark gate |
|---|---|---|---|---|
| Synthetic generators (passport booklet, birth, military, marriage, divorce, id-card, i94, ead, uscis-notice) | `test-fixtures/*.py` + `*.jpg` | 0 real (hardcoded "IVANENKO TARAS") | none (values are the generator input, not GT) | none (smoke only) |
| Degraded robustness set (21 transforms of synthetic passport) | `test-fixtures/degraded/` | 0 real | none | none (local `degraded_passport_matrix.csv` only) |
| "25-doc private corpus" | `PRIVATE_CORPUS_MANIFEST.safe.yaml` (sha256 only) | **0 — source dirs gitignored & CONFIRMED ABSENT** | **ABSENT** (`REAL_DOC_GROUND_TRUTH.local.yaml` gitignored, not present) | none (`benchmark_status: pending` for every field) |

Confirmed absent in worktree: `qa-shots/private/`, `test-fixtures/real-docs/`, `test-fixtures/owner/`,
`docs/audit/REAL_DOC_GROUND_TRUTH.local.yaml`. The corpus is **hashes describing files nobody on this
checkout (or CI) can open**.

## Coverage by document type (real-sample count)
"Real samples" = real sealed documents present + openable in repo/CI. Everywhere = **0**.
The numbers below are the *manifest's claimed* private count (unverifiable here) and the *synthetic* count.

| Doc type | Real-in-repo | Manifest-claimed (unverifiable) | Synthetic fixture | Verified GT | Benchmark |
|---|---|---|---|---|---|
| UA internal passport booklet | 0 | ~3 "passport_or_booklet" (keyword) | yes | no | local-only, identity SAME but DOB/patronymic EMPTY |
| UA international passport | 0 | (folded into "passport_or_booklet") | no dedicated | no | none wired ("VERIFIED GT but not in a runnable gate") |
| UA birth certificate | 0 | 1 (keyword) | yes | no | none wired (claimed GT x2, ungated) |
| UA marriage certificate | 0 | 3 (keyword) | yes | no | none |
| UA divorce certificate | 0 | 2 (keyword) | yes | no | none |
| Military ID | 0 | 2 (keyword) | yes | no | none |
| EAD (US) | 0 | 4 (keyword) | yes | no | local-only: identity SAME, **DOB EMPTY** |
| I-94 (US) | 0 | 4 (keyword) | yes | no | local-only: SAME on 6 fields (best-covered) |
| unclassified | 0 | 6 (keyword guess failed) | n/a | no | none |

`5+ verified-GT real samples`: **none, any type**. `2–4`: **none verified**. `0/1`: effectively
all types when restricted to *verifiable* evidence. Every `FIELD_COVERAGE_MATRIX.csv` row =
`benchmark_status: pending`.

## Is the "0 fabricated" benchmark real or synthetic? — ROOT CAUSE
**Verdict: NEITHER fully real NOR purely synthetic — it is a narrow local run on ABSENT private
inputs, mislabeled by downstream docs as a passed gate.** Evidence from
`artifacts/v1/PRINTED_CYRILLIC_AND_IMAGE_QUALITY/benchmark.json` (its own words):
- `"environment": "local-dev (existing GEMINI_API_KEY; not production, not prod DB)"`
- `"fabricated_critical_fields": 0` is computed over **only** `us_ead_canonical`,
  `ua_internal_passport_canonical`, `us_i94_canonical`.
- In that subset, critical fields are frequently `EMPTY`: EAD `date_of_birth=EMPTY`; internal
  passport `patronymic=EMPTY`, `date_of_birth=EMPTY`. **EMPTY = field not produced, so it cannot
  be "fabricated" — absence is being counted as success.** "0 fabricated" is therefore *true but
  weak*: it proves the system didn't invent values, NOT that it reads critical fields correctly.
- `honest_status` (in the artifact itself) admits: intl-passport/birth/military "have VERIFIED GT
  but are not yet wired into a runnable gate" and lists Stripe/staging/V2 as outstanding.

**Why "real sealed docs" can't be confirmed:** the inputs that would make it a real benchmark
(`test-fixtures/real-docs`, GT yaml) are gitignored and absent. The run *may* have used the owner's
local private docs on the machine that produced commit `2030049`, but **that is unreproducible and
unverifiable from the repo** — exactly the kind of "PASS" the audit charter says to distrust.

## Is it even a CI gate? — NO
`.github/workflows/v1-document-benchmark.yml` is **fail-closed DRY-RUN**: it `exit 0`s without any
provider call unless `V1_BENCHMARK_PAID_ENABLED=true` AND `V1_STAGING_READY=true` (both absent), and
the live path is explicitly *not implemented* (`exit 1` with "refusing to call providers"). So the
benchmark never runs in CI. The committed `benchmark.json` is a **local artifact**, not gate output.

## Runtime reality (Supabase, read-only, project rtfxrlountkoegsseukx)
Real OCR traffic DOES exist and is independent of the V1 benchmark:
- `tps_ocr_audit`: **668 rows**, `extracted_fields`: **138 rows**, `extraction_runs`: **16 rows**,
  `user_corrections`: **10 rows**, `manual_review_queue`: **5 rows** → real users have run OCR.
- `canonical_documents`: **24 rows** (shadow canonical pipeline writing), `canonical_overrides`: 0.
- `wizard_drafts`: **0 rows** → the V1 server PII ledger (#131-#133) is **NOT written in prod**
  (consistent with `SERVER_LEDGER_ENABLED` flag off). Table exists, RLS on, comment confirms
  AES-256-GCM intent, but it is **CODE_ONLY in production**.

## Status (audit vocabulary)
- Real-document corpus in repo/CI: **NOT_BUILT** (P1) — only hashes of absent files.
- Independently-reviewed ground truth in repo: **NOT_BUILT** (P1).
- "0 fabricated" benchmark: **PROVEN_LOCAL** (narrow, unreproducible) / **UNVERIFIED** as a quality claim.
- Broad doc-type coverage (intl passport, birth, military, marriage, divorce): **CODE_ONLY / UNVERIFIED**.
- Synthetic smoke fixtures: **PROVEN_LOCAL** (format/robustness only, no read-accuracy meaning).
- V1 OCR cache + budget guard runtime use: **NOT_WIRED** (see BRAIN_DICTIONARY_AUDIT).

## Root-cause of the coverage gap
1. **PII firewall vs. provability collision.** Correct PII hygiene (never commit real docs) means the
   only verifiable corpus is synthetic, and synthetic docs carry their own answers — so they can
   never prove read accuracy. No sanctioned, reviewable, redacted real-doc GT mechanism exists in
   repo, so every accuracy claim collapses to "trust the owner's local machine."
2. **Manifest-as-proof anti-pattern.** A sha256 manifest was treated as corpus evidence; it proves a
   file once existed somewhere, nothing about type/quality/GT. 6/25 are "unclassified".
3. **Label drift.** A local-dev artifact labeled `"real_document_benchmark"` with `"PASS"` strings
   propagated into STATUS/HANDOFF as a passed gate, despite its own `environment` and `honest_status`
   fields disclaiming that. The downstream docs dropped the disclaimers.
4. **EMPTY-as-pass.** The fabrication metric rewards silence; a doc type that reads *nothing* scores 0
   fabricated. Coverage and correctness were never separated from non-fabrication.
