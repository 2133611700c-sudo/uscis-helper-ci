# Knowledge inventory + audit synthesis (before Phase 2.0)

Date: 2026-06-09 (agent). Read-only. Inputs: live data inventory (this session) + prior audits
(KNOWLEDGE_CORE_INVENTORY 06-03, CYRILLIC_HANDLING_ARCHITECTURE 06-03, P2_DICTIONARY_IN_LIVE_PATH_CHECKPOINT 06-03,
FAILED_CYRILLIC_GROUND_TRUTH_ADJUDICATION 06-02).

## 1. Dataset inventory (entries → consumer → status)

| Dataset | Entries | Consumer | Status |
|---|---|---|---|
| KMU-55 transliterate | 98 rules (54 char + position-dependent + ЗГ + 24 months) | transliterateKMU55 (all) | LIVE, complete. Gap: no Russian variants |
| gazetteer (`GAZETTEER`) | 35 cities + 20 confusion pairs | `snapCity` | LIVE but a SEED |
| settlements registry | **458** settlements (KATOTTG) | `lookupSettlement`/registry | LIVE, but **vs ~28-30k full KOATUU** = seed |
| AUTHORITIES / PATTERNS | 19 / 21 | normalizeAuthority | LIVE |
| GEO_CORRECTIONS | 14 | normalizePlace | LIVE |
| SETTLEMENT_TYPES | 21 | normalizePlace | LIVE |
| OBLAST genitive→nom | 13 | normalizePlace | LIVE |
| SEX_MAP | 14 | normalizeSex | LIVE |
| patronymic rules | 13 exceptions + 8 suffixes | reconcilePatronymic | LIVE, complete |
| registry.csv | 54 rows | registryLookup | LIVE |
| civil_registry_terms.json | 38 | — | **ORPHANED** (exported, not consumed) |
| GLOBAL_BLOCKLIST / FIELD_LABELS | 3 / 8 | — | **ORPHANED** (verify Middle-Name/Militia block is enforced) |
| formatName / garbageGuard | — | partial | formatName now used; garbageGuard ORPHANED |

**Coverage gaps:** gazetteer/settlements are a SEED (35 / 458 vs 28-30k); `gen-settlements.mts` exists, not auto-run.
Authority abbreviations ~70% lack an official-act link (agencyGlossary). No Russian-vs-Ukrainian spelling dataset.

## 2. CRITICAL FINDING — a dictionary-in-live-path layer ALREADY exists (I partly reinvented it)

There are now TWO dictionary layers doing the SAME work (snapCity / patronymic / authority), both OFF:

- **EXISTING — `SMART_NORMALIZE_ENABLED` (P2.1–P2.3, 2026-06-03), at the RIGHT layer (raw Cyrillic available):**
  - Door A: `transliterationPolicy.toCanonicalValue` → `dictionaryBridge.normalizeCity` → `snapCity`
    (`dictionaryBridge.ts:106`, gated SMART_NORMALIZE) — runs on `place_city` BEFORE KMU-55 erases Cyrillic.
  - Door B: `documentFieldReader.ts:94` doc-level post-passes → `patronymicReconcile` + `authorityResolve`
    (gated SMART_NORMALIZE). Tests 25/25. Sets `review_required` + `suggested_value`.
- **NEW — `KNOWLEDGE_BRAIN_ENABLED` (my Phase 1.2/1.3), at the WRONG layer:** `knowledgeNormalize` in
  `arbitrateDocument` — runs AFTER KMU-55 transliteration, so it sees Latin, and its Cyrillic rules (gazetteer /
  RU-spelling / normalizeName) do NOT fire (Phase 1.4 proof). My contract is BETTER (`KnowledgeDecision`:
  action/candidate/provenance/evidence + final-gate separation), but it is at the wrong place and duplicates P2.

**Implication for Phase 2.0:** do NOT "thread rawCyrillic into FieldCandidate" (a third path). Instead **reconcile to
ONE layer** at `toCanonicalValue`/`documentFieldReader` (where raw Cyrillic already lives), keep MY `KnowledgeDecision`
contract, fold in the existing P2 primitives (snapCity/patronymic/authority), unify under ONE flag. This is the
consolidation the rebuild is for; building a 3rd layer would be the opposite.

## 3. CRITICAL FINDING — the dominant real failure is NOT a dictionary problem

From FAILED_CYRILLIC_GROUND_TRUTH (06-02, real birth certs):
- Dominant error = **`wrong_person_selected`**: the model reads a COMPLETELY DIFFERENT identity (wrong name/year/
  city), not a misread. `gemini-2.5-pro` AND `gemini-2.5-flash` were catastrophically wrong on BOTH birth certs.
- Worst mode: `gemini-2.5-pro` returned **`review_required=false` while wrong** (confident + wrong).
- Only `gemini-3.1-flash-image` (with a doc-specific prompt) read the correct identity.

**Implication:** no dictionary/D2 fixes a wrong-person read — it is wrong upstream. The defense is **policy
(always-review hard-case — already wired in `documentClassPolicy`) + model selection + reshoot + doc-specific
prompts**, not normalization. D2's value is on correctly-read text (translit/place/authority), NOT the catastrophic
cases. Do not oversell the dictionary.

## 4. Model selection + the prod gate (owner/GT-blocked)

- `gemini-2.5-pro` is DISQUALIFIED for birth certs (wrong person + false confidence). Per-class model choice is
  unproven and **GT-gated** (needs ground truth from different people). My Phase 1.4 used `gemini-3.1-pro-preview`
  (current provider default) — its birth-cert correctness is NOT proven.
- **Bug:** `gemini-2.0-flash` (HTTP 404 deprecated) is still in the `geminiVisionProvider` fallback chain — real,
  fixable, separate small task.
- **Hard gate (P2 checkpoint):** enabling `SMART_NORMALIZE_ENABLED` (and therefore any dictionary layer) in prod is
  FORBIDDEN until owner-filled ground truth exists and the OFF-vs-ON per-field accuracy delta is measured. The same
  gate applies to `KNOWLEDGE_BRAIN_ENABLED`. No accuracy claim before then.

## 5. Reconciled next steps (supersedes the old "thread rawCyrillic" framing)

1. **Reconcile the two dictionary layers into ONE** at the raw-Cyrillic layer (`toCanonicalValue` Door A +
   `documentFieldReader` Door B), using the `KnowledgeDecision` contract, ONE flag. Retire the arbitration-level
   duplication. OFF=identical; behind flag. *(This is the real Phase 2.0.)*
2. **Fix the deprecated `gemini-2.0-flash` fallback** (small, separate).
3. **Per-class model selection + dictionary OFF/ON accuracy delta** — BOTH need owner ground truth from DIFFERENT
   people. This is the recurring hard blocker; it gates any prod enablement.
4. Gazetteer/settlements expansion toward full KOATUU (`gen-settlements.mts`) — later, optional; safe today
   (fuzzy→review).

Prod untouched. All dictionary flags OFF. ReaderResult/OneBrain runtime HOLD. No PII.
