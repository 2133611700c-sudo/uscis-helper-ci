# Recognition Pipeline: Current Reality → Target Architecture

## 1. Current Live Reality (honest, 2026-06-05)

**Live path:** Gemini-3.1-pro-preview → readDocument → arbitration → post-passes → gates → product adapters

**Active in prod:**
- ANTI_FABRICATION_GATE: ENABLED_BY_ENV — forces review on hard-case identity. **RUNTIME_OBSERVED: NO** (0 documents processed since deploy)
- SELF_CONSISTENCY_GATE: ENABLED_BY_ENV — N=2 hash mismatch detection. **RUNTIME_OBSERVED: NO**
- DOCUMENT_CLASS_METRICS: ON — PII-free class logging. **RUNTIME_OBSERVED: NO** (metric_count_24h=0)

**NOT live (explicitly):**
- HTR (Transkribus/TrOCR): code exists, auth blocked (401), 0 transcripts ever
- GPT-4o second reader: code exists (engine/models.ts:99), NOT in live path (only in dormant consensus)
- consensus.ts: exists with tests, gated OFF by ONE_BRAIN_CORE_ENABLED=1 in prod
- OneBrain/decideField: PARKED scaffold, 0 callers
- SMART_NORMALIZE: OFF, DO_NOT_ENABLE (dictionaries don't fix model reading errors)
- Quality signal: preprocess computes blur/brightness but does NOT reach readDocument

**Accuracy (owner-verified GT, N=6 docs/1 person):**
- Printed (passport, military): 60-83% on live-door-scorable fields
- Hard-case (soviet/handwritten birth certs): 25% (1/4 identity) — model Russianizes Ukrainian text + wrong month/year
- false_negative_review in mode C = 0 (gate catches all errors)
- Ukrainian source text = truth. Russian output = model error.

## 2. Target Architecture

```
D0 quality/preprocess → D1 readers (Gemini-first; provider-agnostic DISABLED slot for a future reader)
→ OneBrain.decideField() → D2 dictionaries as signal → D3 translation 
→ D4 validators → D5 review UI → D6 PDF → Auditor
```
> **Reader strategy = GEMINI-FIRST (correction 2026-06-05):** near-term reader work stays within the Gemini
> family (top versions/benchmarks). A second provider (GPT-4o/Claude) or HTR is **research-only**, gated on GT
> breadth from different people + owner decision + cost/privacy/accuracy evidence. No fan-out until ROI proven.

## 3. Gap List (target minus current)

| Gap | Severity | Effort | Blocked by |
|-----|----------|--------|------------|
| Runtime verification of gates | HIGH | LOW (1 upload) | Owner action |
| 2nd independent reader (provider-agnostic; NOT near-term) | LOW (deferred) | MEDIUM | GT breadth + owner decision + ROI (Gemini-first until then) |
| Quality signal to readDocument | LOW | LOW | Nothing |
| HTR for handwritten | MEDIUM | HIGH | A/B decision + infra |
| OneBrain wired | LOW | MEDIUM | GT≥50 + calibration |
| GT from different people | HIGH | OWNER | Real clients |
| Better UA hard-case model | CRITICAL | UNKNOWN | Model availability |
| Auditor/provenance | LOW | MEDIUM | OneBrain first |

## 4. Waves (ordered by impact/effort)

### Wave A — Runtime safety verification (NOW)
- One controlled hard-case upload through prod UI
- Verify: review_required=true, values unchanged, metric emitted, no errors
- Owner action: upload one birth cert through messenginfo.com
- Result: DEGRADED→VERIFIED or FAIL→rollback

### Wave B — UX review verification — CODE-VERIFIED 2026-06-05 (runtime pending)
- ✅ (code) UI shows review on flagged fields — `EvidenceReviewPage.tsx` "Needs review" + ⚠, gated on
  `field.is_critical && field.review_required`.
- ✅ (code) user can edit — `correct-field` route writes `user_corrections` + updates `normalized_value`.
- ✅ (code) PDF takes corrected values AND is **blocked while review pending** — `generate-pdf` returns the
  `review_required` gate; `render` enforces "final PDF == confirmed DB values" with a PII-safe audit.
- ⏳ Still to confirm in the SAME controlled live upload as Wave A (structural ≠ runtime).
- If UI doesn't show review at runtime: UX_BLOCKER.

### Wave C — GT from different people
- Need documents from real other clients for calibration
- Current GT = 1 person, insufficient for prod threshold decisions
- Collect organically from first clients or hire test participants

### Wave D — HTR A/B research (only if metrics justify)
- Path A: Transkribus — faster, third-party PII risk, DPA needed
- Path B: TrOCR — privacy better, own infra, needs fine-tune for UA/RU
- Decision criteria: hard-case review rate too high for UX

### Wave E — OneBrain / second reader (after GT≥50 from different people)
- Wire decideField into readDocument (shadow first, then live) — Gemini-first.
- A second independent reader (provider-agnostic — GPT-4o/Claude only as candidates, NOT a commitment) is
  evaluated as research ONLY if GT breadth + metrics + owner decision justify it. No fan-out until ROI proven.
- Calibrate thresholds on GT≥50.
- Only after Waves A-C proven.

## 5. Parking

- OneBrain: PARKED until GT≥50 from different people
- HTR: research only, no production commitment
- SMART_NORMALIZE: DO_NOT_ENABLE permanently (unless new model reads UA correctly)
- consensus.ts: dormant, do not reactivate separately from OneBrain

## 6. Stop Rules

- No silent value correction by dictionaries or gates
- No raw API accuracy counted as product accuracy
- No prod flag without rollback command
- No PII in public docs/logs
- No "LIVE" claim without runtime event
- No threshold decisions on GT from 1 person
