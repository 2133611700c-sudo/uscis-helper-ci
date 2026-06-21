# OCR Cache & Provider Budget Runtime Audit (PR #127)

Status: **NOT_WIRED (CODE_ONLY)** — P2 (cost) / evidence-overclaim (P3).

## Verdict
The "immutable OCR cache + fail-closed budget" from PR #127 exists ONLY as a
pure library in `apps/web/src/lib/v1/` and is imported by **nothing outside its
own unit tests**. It does NOT protect any production OCR/AI spend.

## Evidence (primary source, base 02eb595)
- Files: `lib/v1/ocrCache.ts`, `ocrCacheStore.ts`, `providerBudget.ts`,
  `cachedBudgetedProvider.ts`.
- `grep -rln "cachedBudgetedProvider|providerBudget|lib/v1/ocrCache*" apps/web/src
  --include=*.ts | grep -v __tests__ | grep -v "lib/v1/"` → **EMPTY**.
  No route, no `documentBrain`, no `readDocument`, no `vision-extract`,
  no `tps/ocr/extract` imports it.
- The real OCR routes (`api/tps/ocr/extract/route.ts`,
  `api/translation/vision-extract/route.ts`) call providers directly
  (`readDocument`, `documentBrain`, `dualOcrCrossref`) with **no cache lookup and
  no budget check**.
- `cachedBudgetedProvider.ts` header itself says: "The single chokepoint for ANY
  paid OCR/AI provider call **during benchmarks**" and "Pure orchestration with
  injected store + provider fn → fully unit-testable with no real filesystem, no
  network, and no real money." It is a benchmark-harness primitive by design.
- The CI benchmark workflow `v1-document-benchmark.yml` is a **dry-run** that
  `exit 0`s unless `V1_BENCHMARK_PAID_ENABLED=true && V1_STAGING_READY=true`, and
  even then refuses ("Live benchmark path is not implemented"). So the cache/budget
  has never run against a real provider.

## Answers to the required questions
- Is OCR cache wired into the runtime read path? **NO — library-only.**
- Is budget cap enforced fail-closed in runtime? **NO — `DEFAULT_BUDGET` is
  fail-closed but only inside `cachedBudgetedCall`, which production never calls.**
  Production OCR has **no budget cap, no kill switch, no dry-run** at the route.
- Kill switch / dry-run in prod? **NONE for live OCR.**
- Duplicate charges per document? **Possible.** TPS path can fire up to 3 paid
  calls per upload (Vision/DocAI OCR + Gemini documentBrain + Gemini
  dualOcrCrossref, both default-ON), with **no dedupe/cache** across re-uploads
  or Stripe-reload retries. Translation fires one Gemini call per page (+fallback
  chain). No cross-request idempotency on provider spend.

## Root cause
PR #127 built the cache/budget as an injectable, side-effect-free library to make
it unit-testable "with no real money", and deferred wiring to the
`GROUND_TRUTH_CORPUS_AND_CACHE` phase that depends on a staging environment which
**does not exist** (`V1_STAGING_READY` is not `true`). The library was merged and
its tests pass, so PR titles read as "phase-4 cache half" complete — but the
production spend path was never connected. The protection is real for the
benchmark harness and zero for live traffic. This is a sequencing gap (library
before integration), compounded by the missing staging environment that the
integration was waiting on.
