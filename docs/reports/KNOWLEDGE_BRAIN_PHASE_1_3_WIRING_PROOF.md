# Knowledge Brain — Phase 1.3 wiring proof (one shared helper, not four forks)

Date: 2026-06-09 (agent). Branch `feat/one-brain-gemini-core`. Prod untouched (`03eb30f`). Flag `KNOWLEDGE_BRAIN_ENABLED` default **OFF**.

## Goal
Wire the D2 Knowledge Brain so every Core product route uses the SAME authority contract — through ONE shared
helper, with a minimal diff per route, no route-local dictionary logic, no four forks.

## Helper contract — `apps/web/src/lib/canonical/core/knowledgeBrain.ts`
- `isKnowledgeBrainEnabled()` — re-export of the flag (`KNOWLEDGE_BRAIN_ENABLED === '1'`, default OFF).
- `buildKnowledgeContext({ docTypeId, product })` — derives `{ documentClass, ukrainianDoc, isHistorical }`
  centrally (maps via `docintelIdToDocumentClass` / `isUkrainianIdentityDoc` / `isHardCase`). Routes pass only
  their `docTypeId`; no route computes dictionary context itself.
- `applyKnowledgeBrainIfEnabled(candidates, context)` — returns `arbitrateDocument(candidates, ON ? context : undefined)`.
  OFF ⇒ exactly `arbitrateDocument(candidates)` (byte-identical). ON ⇒ D2 authority applied (accept/preserve →
  final; conflict → keep read value + `suggestedValue` + review).

The dictionary is an AUTHORITY LAYER, never a silent auto-replace (ADR-017 §D2). A critical identity conflict is
never silently finalized from D2.

## Files changed (minimal diff)
| File | Change |
|---|---|
| `canonical/core/knowledgeBrain.ts` | NEW — the one shared helper |
| `canonical/core/knowledgeNormalize.ts` | (Phase 1.2) pure D2 decision engine |
| `canonical/core/arbitration.ts` | (Phase 1.2) accepts `knowledge?` ctx, applies decision safely |
| `canonical/types.ts` | (Phase 1.2) `CanonicalField.knowledgeRule/knowledgeProvenance` |
| `app/api/translation/vision-extract/route.ts` | call site → helper (1 line) |
| `app/api/tps/ocr/extract/route.ts` | call site → helper (1 line) |
| `app/api/reparole/ocr/extract/route.ts` | call site → helper (1 line) |
| `app/api/ead/ocr/extract/route.ts` | call site → helper (1 line) |

Each route diff = swap `arbitrateDocument(candidates)` → `applyKnowledgeBrainIfEnabled(candidates, buildKnowledgeContext({ docTypeId, product }))`.
No route imports a dictionary function. No route-local KMU/gazetteer/patronymic logic.

## Route matrix
| Route | Arbitration seam? | Wired via helper | Notes |
|---|---|---|---|
| Translation `vision-extract` (ONE_BRAIN_CORE) | yes | **YES** | UA identity docs |
| TPS `tps/ocr/extract` (ONE_CORE_TPS) | yes | **YES** | UA passport/booklet |
| Reparole `reparole/ocr/extract` (Core) | yes | **YES** | UA passport/booklet |
| EAD `ead/ocr/extract` (Core) | yes | **YES** | US doc → ukrainianDoc=false (mostly Latin preserve) |
| Legacy `ocr/extract` (DeepSeek/gpt-4o-mini text-parse) | **no** | n/a | Does NOT call `arbitrateDocument`; not a D2 seam. Slated for retirement in Phase 2 (GPT removal). No route-local D2 added (forbidden). |
| `translation/generate-pdf` (PDF/payment) | **no** | n/a | Consumes already-arbitrated fields downstream; inherits D2 from the Core read. PDF block governed by the separate C3 field-safety gate. |

## OFF proof (flag absent)
- `tsc --noEmit` → **0 errors**.
- `pnpm --filter web test` → **2937 passed / 4 skipped** (144 files). All existing route + canonical tests unchanged.
- Targeted: `knowledgeBrain.test.ts` proves `applyKnowledgeBrainIfEnabled(cands, ctx)` **deep-equals**
  `arbitrateDocument(cands)` when OFF. canonical/core suite **329/329** unchanged (Phase 1.2).

## ON proof (flag simulated ON in tests only — `vi.stubEnv`)
- Russian spelling on a UA doc (`Сергей`) → `reviewRequired=true`, `suggestedValue` set, `normalizedValue` stays
  `Сергей` (NOT auto-rewritten), `knowledgeProvenance` recorded.
- Clean UA (`Тарас`) → accepted KMU-55 transliteration as final.
- (knowledgeNormalize.test.ts) Міліція → Militsiya accept; gazetteer exact → accept; fuzzy → suggest; patronymic
  fragment → review; MRZ Latin → preserve; unknown authority → review (not invented). Provenance present on all.

## Limitations (honest)
- The Knowledge Brain fires only on the Core arbitration path, which is itself flag-gated (ONE_BRAIN_CORE /
  ONE_CORE_TPS / ONE_CORE_REPAROLE / ONE_CORE_EAD) and OFF in prod. Full product effect needs Phase 2 (make Core
  the default reader). With both flags OFF, behaviour is unchanged.
- ON proof here is at the shared seam + unit fixtures, NOT a live real-Gemini route run (that is Phase 1.4, local).
- `isHistorical` is a hard-case-class heuristic; refine with real fixtures.

## Prod / safety
- No prod env change. No model/provider change. No SMART. No D0 flag. No ReaderResult. No OneBrain runtime
  activation. No HTR. No GPT. No PII in logs (provenance = rule ids / reason codes only, never values). qa-private
  untouched. `KNOWLEDGE_BRAIN_ENABLED` default OFF.

## Next action
- Phase 1.4: local real-fixture proof with `KNOWLEDGE_BRAIN_ENABLED=1` (Militsiya, oblast genitive, patronymic,
  gazetteer) on `test-fixtures/real-docs`, like the C3 real-doc proof — no prod, no Stripe.
- Then Phase 2: make Core the default path for all products + remove GPT + retire legacy `/api/ocr/extract`.
