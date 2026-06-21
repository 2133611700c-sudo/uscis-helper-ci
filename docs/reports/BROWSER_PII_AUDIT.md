# Browser-Persisted PII Audit + Containment (Phase A)

**Date:** 2026-06-13
**Branch:** `architecture/pii-localstorage-containment` (base `main` @ `bd98667`)
**Scope:** the 4 product wizards (TPS, Translation, Re-Parole, EAD).
**Owner directive:** SAFE immediate containment only. NO risky full-wizard rewrite.
Server-side session-ledger migration is a SEPARATE later PR (see Phase B below).

> PII-free document: this audit describes storage SHAPES / keys only. No real
> field values appear here.

---

## Stage 1 — Audit: keys written + per-field classification

Classification legend: **PII** (name/DOB/doc-number/Cyrillic source) · **sensitive**
(provenance/raw OCR text) · **opaque-id** (canonical row id) · **harmless**
(preference / UI state).

### TPS — `apps/web/src/app/[locale]/services/tps-ukraine/start/TPSWizardV2.tsx`
Storage: **localStorage**.

| Key | Holds | Classification |
|-----|-------|----------------|
| `wizard:tps-ukraine:v3:state` | full draft (below) | mixed |
| `wizard:tps-ukraine:v2:id` | wizard run id (random) | opaque-id |
| `wizard:tps-ukraine:v2:state`, `wizard:tps-ukraine:state` | legacy — wiped on load | n/a |

Draft `uploadsMeta[slot]` fields, per the in-memory `FieldExtraction`:
| Field key | Classification | Persisted after containment? |
|-----------|----------------|------------------------------|
| `value` | **PII** (name/DOB/doc#) | YES — needed for redisplay |
| `requires_review` | harmless flag | YES |
| `doc_slot` | harmless slot label | YES |
| `source` | sensitive (provenance) | **DROPPED** |
| `source_document_id` | sensitive | **DROPPED** |
| `source_zone` | sensitive | **DROPPED** |
| `raw_value` | **sensitive — raw OCR text** | **DROPPED** |
| `confidence` | sensitive (model internal) | **DROPPED** |
| `canonical_document_id` (slot-level) | **opaque-id** | YES — Stripe carriage |
| `savedAt`, `lastStep`, `schema` | harmless | YES |
| top-level wizard answers (`manual`, type/ead/method, attestations) | mixed (user-entered) | YES (unchanged) |

### Translation — `apps/web/src/components/services/translation/TranslateWizard.tsx`
Storage: **sessionStorage** (auto-cleared on tab close — lower exposure than localStorage).

| Key | Holds | Classification |
|-----|-------|----------------|
| `tw:v2:draft` (`DRAFT_KEY`) | full draft (below) | mixed |
| `tw:cs` | Stripe checkout id | sensitive-id |
| `tw:ticket:{cs}` | idempotency flag | harmless |

Draft `extractedFields[]`, per in-memory `ExtractedField`:
| Field key | Classification | Persisted after containment? |
|-----------|----------------|------------------------------|
| `field` | harmless field name | YES |
| `value` | **PII** | YES — redisplay + carriage |
| `raw_cyrillic` | **PII (Cyrillic source)** | **YES — load-bearing carriage** (operator hand-off) |
| `review_required` | harmless flag | YES |
| `confidence` | sensitive | **DROPPED** |
| `kind` | harmless meta | **DROPPED** (not needed) |
| `ensemble_candidate` | sensitive | **DROPPED** |
| `review_reasons` | sensitive | **DROPPED** |
| `canonicalDocumentId` | **opaque-id** | YES — Stripe carriage |
| `savedAt`, `screen`, `selectedDocType` | harmless | YES |

> **Carriage note (raw_cyrillic):** unlike TPS/Re-Parole, the Translation
> post-payment `submit-order` operator hand-off (`fields[].raw_cyrillic`,
> ~L1024) resends the Cyrillic source string to staff for the certified
> translation. It MUST survive the Stripe round-trip, so it is the single
> documented allowlist exception. The legacy `generate-pdf` path also reads
> `raw_cyrillic` (`raw_value`/`source_label`, ~L1471). It is NOT dropped.

### Re-Parole — `apps/web/src/app/[locale]/services/re-parole-u4u/start/ReparoleWizardV2.tsx`
Storage: **localStorage**. Same shape/pattern as TPS.

| Key | Holds | Classification |
|-----|-------|----------------|
| `wizard:re-parole-u4u:v3:state` | full draft | mixed |
| `wizard:re-parole-u4u:v3:id` | wizard run id | opaque-id |
| `wizard:re-parole-u4u:v2:state`, `…:state` | legacy — wiped on load | n/a |

Draft `uploadsMeta[slot]` fields (`FieldExtraction`): `value` **PII** (kept),
`requires_review`/`doc_slot` harmless (kept), `source` sensitive (**dropped**),
`raw_value` sensitive raw OCR (**dropped**), `canonical_document_id` opaque-id (kept, carriage).

### EAD — `apps/web/src/components/services/ead/EADWizard.tsx`
Storage: **NONE.** Verified `grep -rn localStorage|sessionStorage apps/web/src/components/services/ead/` → no matches. All wizard state (including OCR field values + `canonicalDocumentId`) lives in React memory only and is lost on reload. **No browser-persisted PII exists, so there is no exposure window to contain.** Containment items A/B/C are N/A for EAD; the static guard still lists `ead: []` in the allowlist so any future persistence must go through the sanitizer.

---

## Stage 2 — Containment applied (safe, additive, no flow regression)

Shared policy module: **`apps/web/src/lib/storage/persistedDraftPolicy.ts`**
(`DRAFT_TTL_MS`, allowlists, `sanitizeField*ForStorage`, `isDraftExpired`).

### A. Expiry / TTL — `DRAFT_TTL_MS = 24h`
Every persisted draft carries a `savedAt` ISO timestamp (TPS already had it;
added to Translation + Re-Parole). On load, `isDraftExpired(savedAt)` discards
+ `removeItem`s any draft older than 24h BEFORE rehydration.
- TPS: TTL discard added at restore (pre-existing 3-day/60-day banner logic kept).
- Re-Parole: `savedAt` added to persist; TTL discard added at restore.
- Translation: `savedAt` added to `DraftState`/`saveDraft`; TTL discard at restore.

### B. Clear on completion / start-over
| Wizard | Terminal success point | Clear action |
|--------|------------------------|--------------|
| TPS | packet ZIP generated (`setGeneratedManifest`) | `removeItem(STORAGE_KEY)` + `draftClearedRef` suppresses re-persist |
| Re-Parole | packet ZIP generated (`packetReady:true`) | `removeItem(STORAGE_KEY)` + `draftClearedRef` |
| Translation | order handed to operator (`/order/{id}` redirect) | `removeItem(DRAFT_KEY)` + `tw:cs` |
| EAD | n/a (nothing persisted) | n/a |
Start-over already cleared the draft in all three (`restart`/`resetAll`); the
`draftClearedRef` is reset there so a fresh document re-enables persistence.
canonical_document_id is consumed in the generate body BEFORE the clear, so the
carriage is never broken.

### C. Drop unnecessary PII (persist-side sanitizer)
`sanitizeFieldMapForStorage` (TPS/Re-Parole) and `sanitizeFieldListForStorage`
(Translation) run BEFORE `setItem`. They keep ONLY the wizard's allowlisted keys
and drop: `evidence`, `raw_value`/`rawValue`, `normalized_value`, `sourceTraces`,
`source`/`source_document_id`/`source_zone`, `confidence`, `ensemble_candidate`,
`review_reasons`, `kind`, `passes`, `ocr_ids`. (TPS already filtered on the
restore side via `SLOT_ALLOWED_FIELDS` + `isGarbageValue`; this extends the drop
to the PERSIST side so the raw data never reaches disk.)

### D. Static guard test
- Helper: `apps/web/src/lib/storage/persistedDraftPolicy.ts` (allowlist + sanitizer).
- Test: `apps/web/src/lib/storage/__tests__/browserPiiGuard.test.ts`.
The test FAILS if the sanitizer stops stripping any prohibited PII-bearing key,
if an allowlist starts including one (except the documented translation
`raw_cyrillic` carriage), or if the TTL constant drifts from 24h.

---

## Stage 3 — Phase B: server-side session ledger (DEFERRED)

**Target.** The browser holds only an **opaque draft token** (random id, no PII).
All draft state — OCR field values, raw Cyrillic source, canonical id — moves to a
server-side, **session-scoped** store (Supabase row or signed server cache) that is:
- **encrypted at rest** and bound to the owner/session (cookie/session id), so a
  draft cannot be read cross-session;
- **expiry-stamped** server-side (TTL enforced by the server, not the client);
- **deleted on completion** (order submitted / packet generated) and on explicit
  start-over, server-authoritatively;
- carried across the Stripe round-trip by the **token only** — the redirect URL /
  cookie never contains PII.

Wizard reads/writes become `GET/PUT /api/draft/{token}`; the post-payment
hand-off resolves the token server-side instead of trusting browser-held fields.

**Why deferred.** Phase B is a full-wizard data-flow change (every persist/restore
+ the Stripe carriage + the operator hand-off rewired to a token). Per owner
directive this is too risky to bundle with immediate containment and must ship as
its own PR with its own test surface. No Phase B code is in this PR.

**Residual risk until Phase B.** Field `value` (and Translation `raw_cyrillic`
carriage) remain in browser storage during an active session, now bounded by the
24h TTL + clear-on-completion + the minimized shape (no raw/confidence/traces).
This is reduced exposure, not elimination — elimination is Phase B.
