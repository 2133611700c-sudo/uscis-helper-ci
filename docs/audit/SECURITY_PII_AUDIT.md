# SECURITY / PII / AUTH AUDIT — Agent 4 (distrust-everything)

Base: worktree main HEAD `02eb595`. Verified prod sha `02eb595` (`/api/healthz`).
Supabase prod: project `rtfxrlountkoegsseukx` (uscis-helper). Read-only.

---

## 1. SERVER PII LEDGER (#129–#133, wizard_drafts) — the headline finding

### Production flag state — VERIFIED
- `GET https://messenginfo.com/api/wizard-draft` → **HTTP 404**. The route 404s
  iff `SERVER_LEDGER_ENABLED !== '1'` (route.ts off-guard). ⇒ **flag is OFF/absent
  in production.**
- Supabase prod `public.wizard_drafts`: table EXISTS (migration `20260614010000`
  applied), RLS enabled, **no policies** (service-role-only by design — correct;
  Supabase advisor flags it INFO `rls_enabled_no_policy`, which is expected here),
  **0 rows**. ⇒ ledger has **never been exercised in production.**

### Crypto / store / route — CODE quality: sound
- `wizardDraftCrypto.ts`: AES-256-GCM, random 12B IV, auth tag, fail-closed on
  missing/invalid 32-byte hex key (`WIZARD_DRAFT_ENC_KEY`). Authenticated → tamper
  fails closed. **PROVEN_LOCAL** (unit-tested).
- `route.ts`: opaque token in httpOnly+secure+sameSite=lax cookie; never logs draft
  or token; 404 when off; 503 when flag on but key misconfigured.
- `wizard_drafts.sql`: ciphertext-only columns, expires_at + index, service-role only.

### ROOT-CAUSE FINDING (P1) — the ledger is NOT_WIRED to any live flow
PR #133 ("wire TPS wizard to server PII ledger") wired `saveDraftToServer` /
`loadDraftFromServer` into **`GeneratePacketBlock.tsx`**. But:

> **`GeneratePacketBlock.tsx` has ZERO importers in the entire repo** (`grep`
> across `apps/web/src` for any `import …GeneratePacketBlock` / `<GeneratePacket`
> → nothing; only stale comment references). It is **orphaned / DEAD_CODE**.

The live TPS wizard is `start/page.tsx → TPSWizardWithErrorBoundary → **TPSWizardV2.tsx**`,
which is **not ledger-aware at all** — it always writes (sanitized) PII to
`localStorage` (`TPSWizardV2.tsx:1848`), with no `isLedgerClientEnabled` branch.

**Consequence:** even if `NEXT_PUBLIC_SERVER_LEDGER_ENABLED=1` were set in prod, NO
live wizard would call the ledger. The "TPS ON flow" cannot be demonstrated because
the wired component is never mounted. Re-Parole, EAD, Translation have **zero**
ledger wiring (`grep` confirms none of the three reference the client adapter).

Why it happened (process root cause): PR #132's "proven E2E" tested the **route in
isolation** (`/api/wizard-draft` integration test), and PR #133 wired the client
adapter into a component that *looks* like the TPS generate step but is an orphaned
earlier extraction. No test asserts the **live** wizard (`TPSWizardV2`) routes PII to
the server, and no browser smoke ran. The chain "route works" + "a component calls
the client" was mistaken for "the product uses the ledger."

### Per-flow status (status vocabulary)
| Flow | Claimed | Actual |
|------|---------|--------|
| TPS ON (live wizard) | WIRED | **NOT_WIRED** (wired to orphan `GeneratePacketBlock`, not live `TPSWizardV2`) |
| Re-Parole ON | "need refactor" | **NOT_WIRED** |
| Translation ON | "need refactor" | **NOT_WIRED** |
| hydrate/save/reload/clear/TTL/delete | n/a | **PROVEN_LOCAL** at unit/route level only; never E2E in a real wizard |
| NO PII in browser when ON | implied | **FALSE for live path** — `TPSWizardV2` still writes localStorage regardless of flag |
| OFF parity (byte-identical) | claimed | **PROVEN** in prod (route 404, 0 rows; no behavior change) |
| PROD flag | "default OFF" | **CONFIRMED OFF** (route 404 + 0 rows) |

Overall ledger status: **CODE_ONLY** (crypto+route+store PROVEN_LOCAL) but
**NOT_WIRED to production product**. Not "done."

### Reconciliation with PR #120 (localStorage minimization) — coexist, NOT replaced
PR #120 (`persistedDraftPolicy.ts`) is the **only PII control actually LIVE** in
prod for the wizards. It is a **minimizer, not a remover**. Its own policy comment
(lines 62–63) is explicit:

> "NOTE: value + raw_cyrillic are PII and REMAIN in browser storage in this slice —
> this policy MINIMIZES exposure (drops evidence/raw/confidence + adds TTL +
> clear-on-completion); full removal needs Phase B (server-side session ledger…)."

So in production today: **applicant field values (names/DOB/address) and
`raw_cyrillic` source values still sit in `localStorage`** (sanitized of
evidence/confidence/source-traces, length-capped, allowlisted keys, TTL via
`isDraftExpired(savedAt)`, cleared on completion). The server ledger (the "full
removal" Phase B) is built but inert. ⇒ #120 and #129–#133 **coexist**; #120 is the
live state, the ledger does not replace it because it isn't wired.

**PII-in-browser risk: P2** — minimized, TTL'd, cleared-on-completion, never logged,
but real applicant PII is still browser-persisted in prod. Not P1 (no leak/exfil
path, httpOnly token unused, no third party).

---

## 2. AUTH — admin routes, Server Actions, mutation routes

Every surface independently verifies auth (does NOT rely on middleware — and
correctly so, since `middleware.ts` excludes `/api`). Verified:

| Surface | Auth | Independent? | Status |
|---------|------|--------------|--------|
| Server Action `sendTranslation` | `requireTranslationOperator()` FIRST (before input/side-effect) | yes | **PROVEN_LOCAL** (PR #122, 21 tests) |
| Server Action `approveAndSendPdf(Form)` | `requireTranslationOperator()` FIRST | yes | PROVEN_LOCAL |
| Server Action `markInReview` | `requireTranslationOperator()` FIRST | yes | PROVEN_LOCAL |
| Server Action `contact.ts` | public form: honeypot + rate-limit (no auth needed) | yes | acceptable |
| `GET /api/admin/manual-review/queue` | `requireAdminAuth(req)` cookie check, 404 on fail | yes | PROVEN_LOCAL |
| `…/manual-review/[ticketId]/transition` | `requireAdminAuth` | yes | PROVEN_LOCAL |
| `/api/wizard-draft` (POST/GET/DELETE) | flag-gated (404 when off); **no operator auth** | n/a | by design (per-user via opaque cookie token) |

### Recipient override / operator identity (PR #122) — genuinely strong
- Recipient is **RE-VERIFIED against Stripe at send time**
  (`resolveVerifiedRecipient` → `stripeTranslationVerifier`). The
  client-writable `manual_review_queue.contact_email` and the form-submitted
  address are **IGNORED**; absence of a verified paid translation session **fails
  closed** (no send). This is the correct authority model. **PROVEN_LOCAL.**
- Email masked in operator UI (`maskEmail`). PII never logged (explicit comments).

### Auth weaknesses (P2/P3)
- **P2 — single shared secret, no per-operator identity.** Both admin API and
  operator Server Actions compare a request cookie to one env `ADMIN_SECRET`.
  Audit actor is a static string `'translation_operator'` (the code itself notes
  "real identity is V2 / PR #119"). No revocation, no rotation, no per-actor
  attribution for the PDF-send / queue-mutation audit trail.
- **P3 — non-constant-time compare** (`cookie !== secret`, `cookie === secret`).
  Shared secret over TLS → low practical risk, but not timing-safe.
- **P3 — CSRF:** Server Actions rely on Next's built-in action protection + the
  `admin_session` cookie (sameSite not set on that cookie path here — relies on
  Next action origin checks). No explicit CSRF token. Low risk given same-site
  admin usage, but unverified against a crafted cross-site POST.

---

## 3. Supabase security advisors (prod, re-pulled)
- INFO `rls_enabled_no_policy`: `wizard_drafts` (expected — service-role only),
  `guard_block_events` (pre-existing).
- WARN `authenticated_security_definer_function_executable`: `public.is_admin()`,
  `public.is_moderator_or_admin()` callable by `authenticated` via REST RPC. **P2** —
  these SECURITY DEFINER fns are reachable by any signed-in role; confirm intent or
  revoke EXECUTE. (Pre-existing, not introduced by #121–#133.)

---

## 4. Doc drift (P3)
- `STATUS.md` / `RELEASE_STATE.yaml` say `production_sha = 62c897a`; live prod is
  `02eb595` (5 PRs merged after the documented sha). STATUS describes the ledger as
  "TPS wizard WIRED … READY" — contradicted by the orphan-component finding above.

---

## Top findings + status + root cause

1. **P1 — Server PII ledger NOT_WIRED to any live flow** (wired into orphaned
   `GeneratePacketBlock.tsx`, 0 importers; live `TPSWizardV2` untouched; reparole/
   ead/translation zero wiring). Prod flag OFF, 0 rows. Root cause: route-level E2E
   (#132) + client-adapter-into-wrong-component (#133) mistaken for product wiring;
   no live-wizard test, no browser smoke. **Status: CODE_ONLY / NOT_WIRED.**
2. **P2 — PII still in browser in prod.** PR #120 (live) minimizes but explicitly
   keeps `value` + `raw_cyrillic` in localStorage; ledger (Phase B removal) inert.
   #120 and ledger coexist; #120 is the real current control. TTL + clear-on-
   completion + no-logging present.
3. **P3 — PR #128 "3/3 PDF readback PASS" is unbacked** (JSON literal, 4 doc-only
   files; the real PROVEN_LOCAL proof comes from #116). See USCIS_PDF_AUDIT.md.
4. **P2 — single shared admin secret, no per-operator identity / no timing-safe
   compare** for PDF-send + queue mutations.
5. **P2 — SECURITY DEFINER RPCs `is_admin`/`is_moderator_or_admin` executable by
   `authenticated`** (prod advisor).
6. **Positive (PROVEN_LOCAL): PR #122 auth is real** — operator-auth-first +
   Stripe-reverified recipient + fail-closed + masked/never-logged.

P0 count: **0**. P1 count: **1** (ledger NOT_WIRED — false "done"/"WIRED"/"E2E"
status, not a leak). No PII leak, no real charge, no wrong-document path confirmed.

---

## 5. Independent spot-checks of remaining big claims

| PR | Claim | Primary-source finding | Status |
|----|-------|------------------------|--------|
| #126 | "advance phases 1-3 to PASS" | merge `0ef6bbd` changed **docs only** (CHANGELOG/HANDOFF/STATUS/V1_STATUS/DARK_CODE_INVENTORY) — **no code**. "PASS" = doc-state flip. | **UNVERIFIED** |
| #127 | "immutable OCR cache + fail-closed budget" | real code (`ocrCacheStore.ts`, `cachedBudgetedProvider.ts`) + unit tests, BUT **zero live importers** — not wired into any OCR caller. | **CODE_ONLY / NOT_WIRED** |
| #128 | "0 fabricated + 3/3 readback PASS" | 4 doc-only files + 1 JSON literal; real proof is #116. | **UNVERIFIED** (claim) |
| #130 | "server ledger backend + /api/wizard-draft" | real code + migration + tests (applied to prod, 0 rows). | **PROVEN_LOCAL** (unit/route) |
| #131 | "browser client adapter (#9 stack complete)" | real `wizardLedgerClient.ts` + tests; "stack complete" misleading — adapter only wired into orphan component. | **CODE_ONLY** |
| #132 | "route integration — proven E2E" | tests `/api/wizard-draft` **in isolation**, not via a live wizard. | **PROVEN_MOCKED/LOCAL** (route only; NOT product-E2E) |
| #133 | "wire TPS wizard to server ledger" | wired into `GeneratePacketBlock.tsx` = **0 importers / orphan**; live `TPSWizardV2` untouched. | **NOT_WIRED** |
| #122 | "operator auth + Stripe recipient re-verify" | real, auth-first, fail-closed, Stripe-authoritative recipient, masked/no-log; 21 tests. | **PROVEN_LOCAL** |

Independent re-run evidence (this audit, local):
- Ledger suite (`lib/v1/__tests__/` + `api/wizard-draft/__tests__/`): **10 files / 63 tests passed.**
- PDF field-by-field (`i821`+`i131`+`i765`): **3 files / 46 tests passed.**

Pattern (root cause across the V1 track): a recurring conflation of "module exists
and its own unit/route test passes" with "the product uses it." #127 (cache),
#131/#133 (ledger), and #128 (benchmark) all advertise completion/PASS while being
either NOT_WIRED to a live caller or backed only by a doc/JSON write. The
verification gap is the absence of a **live-path / browser smoke** assertion for
each newly-built module.
