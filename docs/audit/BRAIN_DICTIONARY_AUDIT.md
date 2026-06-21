# BRAIN_DICTIONARY_AUDIT.md — Audit Agent 3

Base `02eb595`. Read-only. PII-safe (no applicant values). Cost CSV intentionally omitted
(owned by Agent 2 — only call-path / paid-or-not noted here).

---

## PART A — DICTIONARIES (`packages/knowledge`)

### Inventory, source, version, runtime use
| Module | Stated source / version | Runtime importers (non-test) | Tests |
|---|---|---|---|
| `dictionary.ts` | "Ukraine Terminology Dictionary v1.3 — mvs/dmsu/czo.gov.ua, KMU No.55, MFA #CorrectUA, FamilySearch" | via `index.ts` → `dictionaryBridge.ts`, translation glossary, tps modules | indirect |
| `transliterate.ts` | "KMU-55 (CMU Resolution No.55, 27 Jan 2010)" — `transliterateKMU55()` + source-script router | mrzAuthority, transliterationPolicy, formatName, normalize, glossary | `transliterate.test.ts` |
| `mrz.ts` | TD3/TD1 MRZ parse + checkdigit | arbitration/mrzAuthority, tps passport module | `registry/mrz.test.ts` |
| `gazetteer.ts` | "24 oblast centres + project cities", Cyrillic nominative | normalize (oblast genitive→nominative) | indirect |
| `civil_registry_terms.json` | `_version 2.0.0` — birth/marriage/divorce; explicit ЗАГС/РАЦС/ДРАЦС historical rule | birthCertificate/marriage/divorce modules | indirect |
| `patronymic.ts` | derive+validate по батькові (ович/евич/івна…) | docintel patronymicReconcile, tps modules | `patronymic.test.ts` |
| `normalize.ts` | orchestrator (oblast, settlement, dates) | translation + tps post-extract | `normalize.test.ts` |
| `registry/registry.csv` (55 lines) + `settlements.generated.ts` | generated DMS-verified registry | registryLookup | `registry.test.ts` |
| `garbageGuard.ts` | non-document / OCR-garbage detector | hallucinationGuard, tps modules | indirect |

**Wiring is real and broad**: 30+ runtime files import `@messenginfo/knowledge` across translation,
TPS, EAD, reparole OCR routes and the canonical core. This is NOT dead code. **Status: PROVEN_LOCAL
(wired + unit-tested); runtime correctness on real docs UNVERIFIED** (no real corpus — see coverage report).

Local test run (global `npx vitest`, worktree has no `node_modules`): **18 knowledge tests passed**
(transliterate/normalize/patronymic/e2e-passport). 4 files errored only on harness resolution
(`vitest/config` not installed in worktree), not on assertions — re-run in a hydrated tree to confirm full count. **Status of full suite: UNVERIFIED in this worktree.**

### HARD RULES — verified in code (PRIMARY SOURCE)
| Rule | Code evidence | Verdict |
|---|---|---|
| Patronymic ≠ Middle Name | `dictionary.ts:271-274` `en:'Patronymic'`, `do_not_use:['Middle Name']` | PRESENT |
| Міліція → Militsiya (not Police/Militia) | `dictionary.ts:74-81` `MILITSIYA` `official_en:'Militsiya'`, `do_not_use:['Police','Militia','National Police']` | PRESENT |
| смт → urban-type settlement (never city/town) | `dictionary.ts:242-246` with explicit warning; covers смт/смт./селище міського типу/п.г.т./пгт | PRESENT |
| Oblast genitive → nominative | `normalize.ts:237-244` `normalizeOblastToNominative` → "Вінницької області"→"Vinnytsia Oblast" | PRESENT |
| Historical names preserved (ЗАГС/РАЦС not modernized) | `civil_registry_terms.json` notes 1-3 | PRESENT |
| MRZ / printed-Latin controlling | `arbitration.ts:75` MRZ wins outright; `DOCUMENT_TYPES.yaml` passport names `auto` (MRZ-controlling) | PRESENT |
| Passport-Latin priority over re-transliteration | source-script router in `transliterate.ts:148` | PRESENT |

### Conflicts / hidden guessing / normalized-vs-controlling
- **No silent auto-replace.** `arbitration.ts:121-122,182-215`: a value CONFLICT is *never* silently
  substituted — the read value is kept, the dictionary candidate surfaces as `suggestedValue`, review
  is forced. `accept/preserve` (deterministic-safe) is applied; `suggest/review/block` is not.
  **Status: PROVEN_LOCAL (design verified in code).**
- **Coexistence, not conflict:** `dictionary.ts` has both a modern "National Police of Ukraine" entry
  and the historical `MILITSIYA` entry. These are distinct entities; the hard rule is satisfied as long
  as routing keys on the source token (Міліція). Worth a targeted GT test — currently **UNVERIFIED** on
  real historical docs.
- **Hardcoded synthetic values** live only in `test-fixtures/*.py` generators, not in the dictionary.
- **Gazetteer is a 24-centre seed**, not exhaustive → places outside the seed fall through to raw
  KMU-55 transliteration (acceptable, but a coverage limit, not a bug). **P3.**

---

## PART B — THE BRAINS (two distinct systems — do not conflate)

### B1. DeepSeek "Document Brain" — `apps/web/src/lib/tps/ai/documentBrain.ts`
- **Really called?** YES. `runBrain` is invoked by `/api/tps/ocr/extract` (+ health/shape-debug).
  Translation + reparole OCR routes call DeepSeek via the same `lib/deepseek/client.ts`. **Wired, live.**
- **Paid?** YES — real `deepseek-chat` HTTP call when `DEEPSEEK_API_KEY` present. DARK_CODE_INVENTORY's
  own note: "TPS_AI_BRAIN + DUAL_OCR_CROSSREF effectively ON/paid in prod". Enable logic
  (`isBrainEnabled`, lines 191-193): ON whenever key present unless `TPS_AI_BRAIN_ENABLED='0'`
  (default-ON, *not* opt-in despite the older comment). **Cost detail → Agent 2.**
- **Inputs/outputs:** input = OCR `raw_text` capped at 4000 chars + lines (text-only; NO image,
  per route comment line 816 "only raw_text + lines, no image, no PII bundle"). Output = strict Zod
  envelope per field: `source_value`, `final_value`, `confidence`, `source_line`, `requires_review`.
- **Can it fabricate?** Structurally constrained:
  - `hardenFinalValues()` (lines 319-390) **OVERWRITES** every `final_value` with a deterministic
    `toWinAnsiSafe(source_value)` / KMU-55 transliteration — the model's claimed `final_value` is
    **never trusted**. Names go through `analyseNameField` (mixed-script / bad-casing detector).
  - Any disagreement (`safeFinal !== f.final_value`), `confidence < 0.7`, or model-flagged review →
    `requires_review:true`, never auto-merged. SYSTEM_PROMPT line 798 "NEVER fabricate; if unsure, omit".
  - Merge policy (header lines 200-207): brain field added only if conf ≥0.7 AND not already covered by
    a rules field of ≥ confidence; validators run before merge.
  - **This is a genuine, code-enforced anti-fabrication design — the strongest part of the stack.**
    **Status: PROVEN_LOCAL.** Residual risk: the model can still mis-READ `source_value` (wrong but
    not "fabricated"); only review + GT catches that, and GT is absent → **UNVERIFIED on real docs (P2)**.
- **Evidence retained / audit?** `tps_ocr_audit` has **668 rows** in prod Supabase (PII-safe by table
  contract). So runs ARE logged. Raw values not stored. **Status: PROVEN_PRODUCTION (audit exists).**
- **Ranking / confidence / silent overwrite / review / fallback:** confidence-gated merge; MRZ/rules
  outrank brain; no silent overwrite of higher-confidence rule fields; fallback chain returns typed
  error codes (NOT_CONFIGURED / AI_TIMEOUT / INVALID_JSON) instead of crashing → 0 fields surfaced on
  failure (historical prod bug, since fixed by maxTokens=2500 + default-ON).

### B2. Knowledge Brain (D2) — `canonical/core/knowledgeBrain.ts` + `arbitration.ts`
- **Not an AI.** It is the deterministic dictionary authority layer. Flag `KNOWLEDGE_BRAIN_ENABLED`
  **default ON** (`knowledgeNormalize.ts:82-83`: ON unless `='0'`). When OFF → byte-identical to bare
  `arbitrateDocument`. Applies dictionary as authority with the no-silent-substitution contract above.
  **Status: PROVEN_LOCAL (wired, tested), real-doc effect UNVERIFIED.**

### B3. Gemini Vision — the actual READER
- `docintel/providers/geminiVisionProvider.ts`: primary `gemini-3.1-pro-preview`, fallback chain
  `gemini-3.5-flash` → `gemini-2.5-flash` (2.0 removed, 404-deprecated). Comments record that
  `gemini-2.5-pro/-flash` returned **wrong-person identity** on certificate docs and are disqualified
  per-class. **This is the real fabrication-risk surface** (a vision model inventing a person), and it
  is mitigated only by the arbitration review gate + anti-fab gate (`ANTI_FABRICATION_GATE_ENABLED`
  **default OFF**, `antiFabricationGate.ts:3`). **So the dedicated anti-fabrication gate is OFF in
  prod; protection relies on the arbitration MRZ/conflict review path.** **Status: PARTIAL (P1 risk).**

### B4. V1 cache/budget (PR #122/#128 claims) — NOT WIRED
`lib/v1/{ocrCache,ocrCacheStore,cachedBudgetedProvider,providerBudget,stagingContract}.ts` have unit
tests but **zero non-test importers** in `app/` or `components/`. The "OCR cache + budget guard"
is **CODE_ONLY / NOT_WIRED** — no route uses it; benchmark workflow is fail-closed dry-run.
Only `wizardDraftStore`+`wizardDraftCrypto` (AES-256-GCM) are wired, behind `SERVER_LEDGER_ENABLED`
(404 when off), and `wizard_drafts` has **0 prod rows** → ledger CODE_ONLY in production.

---

## ROOT CAUSE (brain/dictionary)
1. **The strongest safeguard (DeepSeek `hardenFinalValues`) protects only the TEXT brain, not the
   VISION reader.** Gemini vision is the component documented to have returned wrong-person identities,
   yet its dedicated `ANTI_FABRICATION_GATE` is default-OFF; safety leans entirely on the arbitration
   review gate + MRZ anchor. For doc types with no MRZ (booklet, certificates) that anchor is absent →
   the highest-risk path has the thinnest net. **P1.**
2. **"Brain works" was proven on synthetic text, not real images.** All anti-fabrication tests feed
   crafted `source_value`/`raw_text`; none feed a real degraded photo through Gemini+arbitration with
   independent GT. Non-fabrication ≠ correctness, and correctness is unmeasured.
3. **V1 reliability features (cache/budget) were built and tested but never wired**, so the cost/abuse
   guarantees implied by PR #122/#128 do not hold at runtime. Classic "merged green, not connected".

## P0 / P1 summary (this agent)
- **P0: 0.** No data-loss / PII-leak / wrong-charge defect found in brain/dictionary scope. (PII ledger
  is encrypted-at-rest, RLS-on, and unused in prod.)
- **P1: 3** — (1) real-corpus + reviewed GT NOT_BUILT (can't prove read accuracy);
  (2) `ANTI_FABRICATION_GATE` OFF while Gemini vision is the documented wrong-identity surface on
  MRZ-less docs; (3) "0 fabricated" benchmark is local/unreproducible/EMPTY-as-pass, mislabeled as a
  passed gate downstream.
