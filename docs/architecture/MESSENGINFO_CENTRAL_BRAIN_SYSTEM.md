# MESSENGINFO CENTRAL BRAIN — unified system architecture

**Principle:** ONE central brain serves ALL products (TPS, Re-Parole U4U, EAD, Translation).
No per-product "mini-brains", no copied pipelines, no single AI reader as truth-source, no
PDF without official structure, no official claim without a source URL. Migrate by ADAPTER —
never break working TPS.

## Phase 0 reality (verified 2026-05-29)
Brain is TPS-only. Re-Parole = OCR without brain. EAD = HTML, no AI. Translation = single
Gemini Flash (hallucination risk). The recognition engine built this session
(`apps/web/src/lib/engine/`, 29/29 tests) IS the central-brain spine — not yet wired.

## Departments (employees = engines/services)
| Dept | Mission | Implemented by (existing/new) | Truth-source rule |
|---|---|---|---|
| **D0 Intake/QC** | quality gate, doc-type + printed/handwritten detection, page crop, re-upload request | `sharp` + classifier (Gemini 1 call) — *partial in TPS, to centralize* | bad photo → re-upload, never proceed blind |
| **D1 Readers** | OCR/HTR/Vision → candidates+confidence+zones | Google Vision/DocAI (printed baseline), **Transkribus/PyLaia** (handwriting, printed-only proven), Gemini/GPT-4o (auxiliary), `engine/models.ts`+`engine/htr.ts` | NO single reader = truth; handwriting needs ≥2 or human |
| **D1.5 Consensus** | agree→accept, disagree→guard, open-name→confirm | `engine/consensus.ts` (13 tests) | shared-misread guard on open names |
| **D2 UA Normalizers** | KMU-55, gazetteer, oblast, patronymic, authority glossary, dates, doc-number cleanup | `packages/knowledge/*` (transliterate/gazetteer/patronymic) + `engine/orchestrator.ts` | deterministic, no AI guessing |
| **D3 Translation** | glossary terms + DeepSeek prose; names/dates/numbers LOCKED | `engine/terminologist.ts`+`engine/translator.ts` (8 tests) | UA layer primary; RU only OCR aid; no invented agencies |
| **D4 Product Rules** | TPS/ReParole/EAD/Translation form rules, required fields, readiness gate | `lib/tps/readinessPolicy.ts` (TPS) + new per-product rules | no output without source evidence |
| **D5 Review UI** | field + crop + why accepted/rejected; manual fix; 30–80yo friendly | wizard review rows | uncertain → empty, never AI garbage as truth |
| **D6 PDF/Package** | official-form translation PDFs + USCIS packets + ZIP + cert + evidence map | `engine/assembler.ts`+`renderPdf.ts` + `lib/translation/forms/ukraine/schemas` + `lib/packet` | no PDF if required data missing; official structure only |
| **D7 Auditor** | log every value: who read, which doc, which model, rejected, corrections, PDF readback | `lib/tps/ocrAudit.ts` → generalize | retention policy; one ledger for all products |
| **D8 Monitoring** | health, E2E, PDF byte-readback, drift gates | `/api/healthz` + Playwright | no "verified" without live proof |

## Product → department usage (target)
| Dept | TPS | Re-Parole | EAD | Translation |
|---|---|---|---|---|
| D0–D2 | ✅ | ✅ (migrate) | ✅ (migrate) | ✅ (migrate first) |
| D3 Translation | doc-translation add-on | — | — | ✅ core |
| D4 rules | I-821(+I-765) | I-131 / U4U | I-765 + eligibility | 8 CFR 103.2(b)(3) cert |
| D6 PDF | ZIP packet | I-131 packet | I-765 packet | official-form translation PDF |

## Central Brain API (thin wrapper over existing modules — Phase 4)
`apps/web/src/lib/central-brain/` → `POST /api/central-brain/{analyze,merge,review,generate}` + `GET /health`.
Input `{product, locale, documents, userCorrections, mode}` → output `{docTypes, recognizedFields, rejectedCandidates, reviewRequiredFields, missingRequiredFields, productReadiness, officialSourcesUsed, translationPacket, formPacket, pdfReadiness, auditId, riskFlags}`.

## Migration (adapter, never break TPS)
1. Build central-brain lib (the engine already covers D1–D3,D6; wrap as API). Tests only.
2. **Translation first** (worst hallucination risk) → replace single-Gemini path with consensus engine.
3. Re-Parole → replace standalone OCR with brain adapter.
4. EAD → replace HTML-only with brain + I-765 eligibility-controlled rules.
5. TPS last → move its brain into the common wrapper, behavior-preserving.
6. One shared audit ledger. 7. One health dashboard.

## Official basis per product
TPS → USCIS I-821 (+I-765). Re-Parole → I-131 / U4U re-parole process. EAD → I-765 + controlled eligibility category (never guessed). Translation → 8 CFR 103.2(b)(3); not legal advice; no "certified" until human signs. UA document structures → `docs/official-forms/ukraine/source-ledger.json` (KMU 1025/353/302/152, etc.).

## Hard rules → ADRs
Record as ADRs: (1) one central brain, (2) no single AI truth-source, (3) no PDF without official structure, (4) no official claim without source URL, (5) migrate by adapter. See `docs/adr/`.
