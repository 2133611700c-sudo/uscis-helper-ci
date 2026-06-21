# AUDIT — Sessions 49–53 (Translation wizard on messenginfo.com)

**Auditor role:** skeptical senior engineer — every prior "VERIFIED" treated as suspect until independently re-confirmed.
**Date of audit:** 2026-05-28
**Method:** independent tool calls only (curl with browser UA, git, grep, vercel CLI, headless Playwright against production). No claim trusted from STATUS/HANDOFF/CHANGELOG without a fresh check.
**Scope of "read-only":** no application/infrastructure code modified. The only writes are this report and one memory file. No fixes applied (per rules of engagement).

---

## TL;DR

The wizard is **real and working on production**: GEMINI_API_KEY is set, the landing 307-redirects to `/start`, real Gemini OCR returns fields, and a live headless Playwright walk confirmed every UX claim (edit button, multi-page 36px, count-aware CTA, contrast 17.74:1, no per-row "English"/flags) on **both desktop and mobile**. Two real findings stand: **(P1) the free Gemini key on a publicly-reachable endpoint sends client PII to a tier that trains on it**, and **(P1) commit `3580315` — documented as "Pure CSS change, no JSX/logic touched" — actually committed 354 files / +101k lines including 34 filled I-821/I-765 form dumps containing the owner's real surname.** Everything else (payment gate, KMU-55 chain, no-regressions, no secrets, no forbidden phrases) checks out.

---

## Verdict matrix

| Claim | Verdict | Evidence (independent) |
|---|---|---|
| **C1** GEMINI_API_KEY on prod + OCR 200 | ✅ PASS | `vercel env ls production` → `GEMINI_API_KEY … Encrypted … Production … 14h ago`. `curl POST .../vision-extract` → **HTTP 200 in 10.3s**, fields `TESTSURNAME/TESTGIVEN/1985-07-12`. |
| **C2** `/translate-document` 307→`/start` (4 locales) | ✅ PASS | GET+UA → `HTTP/2 307`, `location: /<loc>/services/translate-document/start` for ru/uk/en/es; `-L` follows to HTTP 200. No `$19.99/$29.99/bg-blue-600` in final HTML; `tw-root` present. (Initial `403` was Cloudflare WAF blocking UA-less `curl -I`, not the site.) |
| **C3** Wizard hydrates, TPS-green CTA | ✅ PASS *(live, HEADLESS)* | H1 = "Перевод документов"; `.tw-btn-primary` bg = **`rgb(16,163,127)`** (= #10a37f). |
| **C4** No per-row "English", no flags | ✅ PASS *(live)* | After real OCR: 3 rows; `body.innerText` "English" count = **1** (cert body only); flags = **0**; no "English" inside any `.tw-trans-row`. |
| **C5** Edit → native prompt → ИСПРАВЛЕНО | ✅ PASS *(live)* | `dialog.accept('TESTCORRECTED')` → 1 `.tw-trans-row.user-edited`, badge text **"ИСПРАВЛЕНО"**, row value contains `TESTCORRECTED`. |
| **C6** Multi-page ≤6, 36px remove, count CTA | ✅ PASS *(live)* | 2 files → 2 `.tw-page-tile`; remove btn box = **36×36**; CTA "Распознать 2 стр. →"; after remove → 1 tile, CTA "Распознать документ →". `MAX_PAGES=6` in source. |
| **C7** Mobile parity 375×812 | ✅ PASS *(live)* | Identical results on mobile context; CTA height **61px** (≥48). |
| **C8** Contrast ≥4.5:1 (was 2.5) | ✅ PASS *(live)* | Translation text `rgb(17,24,39)` on `rgb(255,255,255)` = **17.74:1**. Green-on-green removed from source. |
| **C9** No v5 §31 forbidden phrases | ✅ PASS | 0 matches in `TranslateWizard.tsx` and deployed `/start`. The one "сертифицированным переводом" hit is USCIS-requirement guidance text from a **different** (TPS child-doc) component, not a product claim. |
| **C10** Gemini-vision + KMU-55 (no LLM Latin) | ✅ PASS *(code)* / ⚠️ live-Cyrillic UNVERIFIED | `geminiVisionProvider` prompt: *"Do NOT transliterate to Latin yourself"* + *"never return only a suffix (never 'ович' alone)"*, `temperature:0`. `transliterationPolicy`: names → KMU-55 only. Unit test pins `Тарас→Taras`, `Тарасович→Tarasovych`. **Not** proven live on the standalone endpoint — the only fixture is Latin (`TESTSURNAME`); a Cyrillic image was not pushed through prod this audit. |
| **C11** generate-pdf rejects unpaid | ✅ PASS | `curl POST .../generate-pdf -d '{}'` → **HTTP 402** `{"error":"payment_required"}`. |
| **C12** No regressions in TPS/EAD/ReParole | ✅ PASS | `git log 3580315^..HEAD -- lib/tps lib/ead lib/reparole` = **0 commits**. `vitest run` → **2124 passed \| 1 skipped**; `tsc --noEmit` exit **0**. Exactly matches the claim. |
| **C13** Free Gemini key trains on PII | 🔴 CONFIRMED RISK (P1) | Endpoint publicly reachable (anon `POST` → 200, GET → 405), `rateLimit` 8/min but **no owner/auth gate**. Free tier trains on data (per provider docstring + CHANGELOG admission). Exact key signature **not pulled** (would exfiltrate a secret) → that sub-claim UNVERIFIED; risk holds regardless. |
| **C14** No secrets committed | ✅ PASS | Only `REDACTED_GOOGLE_API_KEY_DO_NOT_USE…` strings in history live inside **downloaded uscis.gov HTML** (`docs/uscis/...`) — Google/USCIS public keys, not ours. `.env*`/`.env*.local` gitignored. `service_role` = Postgres role name in SQL, not a JWT. |
| **EXTRA** "Pure CSS change" (commit 3580315) | 🔴 FALSE + PII (P1) | See "Cross-cutting findings → Documentation & PII integrity". |

---

## Detailed findings

### C1 — GEMINI_API_KEY on production — PASS
`vercel env ls production` lists `GEMINI_API_KEY` (Encrypted, Production, created **14h ago** = 2026-05-28, matches the claim). Live proof:
```
curl -X POST https://messenginfo.com/api/translation/vision-extract \
  -F file=@test-fixtures/synthetic-passport.jpg -F docTypeId=ua_internal_passport_booklet
→ HTTP 200 in 10.3s
fields: family_name=TESTSURNAME, given_name=TESTGIVEN, dob=1985-07-12 (raw "12 JUL 1985")
provider=gemini, model=gemini-2.5-flash
```

### C2 — Landing redirect — PASS
All four locales 307 to `/<loc>/services/translate-document/start`. `x-matched-path: /[locale]/services/translate-document` confirms the route file is the redirect. **Note on method:** a plain `curl -I` (no User-Agent) returns `403` — that is Cloudflare bot protection in front of Vercel, not a broken page. With a browser UA it is a clean 307→200. Stale markers (`$19.99`, `$29.99`, `bg-blue-600`) are absent from the final HTML.

### C3–C8 — Live browser walk (HEADLESS, production backend, real Gemini OCR)
One headless Chromium script walked Welcome → DocType ("Паспорт Украины" tile, auto-OCR) → Upload → real OCR → Review → Edit, on **desktop (1280×900)** and **mobile (375×812)**. All assertions passed identically on both. Screenshots saved MAC-SIDE to `/tmp/audit-{desktop,mobile}-{1welcome,2review,3edited}.png` — these prove what the script saw headlessly, **not** what the owner sees in his own browser.

Raw result (both profiles): `c3_cta_bg=rgb(16,163,127)`, `c6_remove_box=36x36`, `c6_cta_text_2="Распознать 2 стр. →"`, `c4_body_english=1`, `c4_body_flags=0`, `c4_english_in_rows=false`, `c8_ratio=17.74`, `c5_badge="ИСПРАВЛЕНО"`, `c5_value_has_corrected=true`, `c7_cta_h=61`.

### C9 — Forbidden phrases — PASS
0 v5 §31 phrases in wizard source and deployed HTML. The lone "сертифицированным переводом" in the 165 KB page is instructional ("attach the child's birth certificate with a certified translation" — describing a USCIS requirement), originates outside `TranslateWizard.tsx`, and is not a claim that our product produces certified translations. **Recommend** a content-rule pass to confirm that wording is intentional, but it is not a wizard regression.

### C10 — KMU-55 chain — PASS (code) / live-Cyrillic UNVERIFIED
Architecture is correct and defends against the historical `Yovych`/`Prostianets` bugs at the prompt level. The deterministic transliteration is unit-pinned. What was **not** done this audit: pushing a real Cyrillic image through the production `vision-extract` endpoint to observe `Тарас→Taras` end-to-end (the available fixture is already-Latin). Mark live confirmation UNVERIFIED, code PASS.

### C11 — Payment gate — PASS
402 without `X-Payment-Token`. Owner-bypass path not exercised (would need owner token) — its existence is in source but UNVERIFIED live.

### C12 — No regressions — PASS
Full session range `3580315^..HEAD` touches **0** files under `lib/tps`, `lib/ead`, `lib/reparole`, `components/services/tps`. Code-product isolation holds. Independently re-run this audit: `vitest run` → **2124 passed | 1 skipped** (71 files passed, 1 skipped), `tsc --noEmit -p apps/web/tsconfig.json` → exit **0**. Exactly matches the claimed "2124 pass + 1 skip, 0 type errors".

### C13 — Free-tier PII exposure — CONFIRMED RISK (P1)
`/api/translation/vision-extract` is reachable by anyone (anonymous POST returned 200). It is rate-limited (8/min/IP) but has **no authentication/owner gate**. Any uploaded document image is sent to Google's **free** Gemini tier, which trains on submitted data. For a product whose entire purpose is processing identity documents (passports, birth certificates) of real people, this is a genuine privacy exposure, not a theoretical one. The owner accepted this temporarily; it must not be advertised broadly until a **paid AQ key** replaces the free key. I deliberately did **not** pull the key value to confirm the `REDACTED_GOOGLE_API_KEY_DO_NOT_USE…` free-tier signature — exfiltrating a production secret is worse than leaving that one sub-claim UNVERIFIED.

### C14 — No secrets in repo — PASS
The only key-shaped strings in git history are Google public keys embedded in **downloaded uscis.gov pages** under `docs/uscis/`. `.env`/`.env.local` are gitignored. No `sk_live`/`sk_test`/service-role JWT committed.

---

## Cross-cutting findings

### 🔴 Documentation & PII integrity — commit `3580315` (P1)
- HANDOFF/CHANGELOG/STATUS describe Session 49 (`3580315`) as: *"restyle wizard 1:1 to TPS… **Pure CSS change. No JSX/logic touched.**"*
- Reality from `git show --stat 3580315`: **354 files changed, +101,142 insertions**, of which **345 are under `docs/reports/`**.
- It **newly added 34 `I-821.txt` evidence dumps** (parent tree had 0). These are filled USCIS forms containing the owner's real PII — e.g. `(Last Name) Ivanenko` — plus I-765 dumps, OCR network JSON, owner-status JSON.
- This contradicts the Session-27 retention policy ("`.gitignore` blocks evidence artifacts"): the patterns covered `.zip/.pdf/.png` but **`.txt` PDF-dumps slipped through**.
- **Impact:** a misleading commit message bundled real identity-document PII into git history. Repo is private, so this is P1, not P0 — but it should be scrubbed (history rewrite or at minimum stop tracking + extend `.gitignore`), and the "pure CSS" claim corrected.

### Accessibility — OK
`aria-hidden` on the ↓ arrow; `aria-label` on edit (`s5_edit_aria`) and page-remove (`s3_remove_aria`); remove target 36×36; primary CTA 61px (mobile included). No issues found.

### SEO / metadata (P2)
- `apps/web/src/app/sitemap.ts:29` still lists the redirecting slug `translate-document`, not `/start`. Search engines are pointed at a 307. Canonical on the landing route correctly targets `/start`, so SEO is not split — but the sitemap entry is debt.
- The `/start` page's own OG title is generic ("Messenginfo – Помощь с USCIS…"), not translation-specific. The translation-specific OG metadata lives on the redirecting page (which users never see rendered). Minor.

### Backend observability — not pulled
Vercel runtime-log 200/502 breakdown for the last hour was **not** retrieved this audit. The live curl (200) + the two browser OCR calls (200) are positive evidence; a full log sweep remains UNVERIFIED.

---

## Recommended next actions (by severity)

**P0 — none.** Production is not broken; no public secret leak.

**P1 — do soon:**
1. **Provision the paid AQ Gemini key** and swap it on Vercel Production, or gate `/api/translation/vision-extract` behind owner/session auth until then. Until done, do not market the wizard to clients. (C13)
2. **Scrub committed PII** added by `3580315`: stop tracking `docs/reports/evidence/**` form dumps, extend `.gitignore` to `*.txt` under evidence/pdf paths, and (decision for owner) rewrite history to purge I-821/I-765 dumps containing real names. Correct the "pure CSS change" claim in CHANGELOG. (Extra finding)

**P2 — schedule:**
3. Point `sitemap.ts` at `/start` (or drop the redirecting slug). Set translation-specific OG metadata on the `/start` page itself.
4. Push one real **Cyrillic** image through production `vision-extract` to close C10's live gap (Тарас→Taras).
5. Confirm the "сертифицированным переводом" guidance wording against content rules (C9).
6. Pull Vercel runtime logs to close the observability gap.

---

## Honesty self-disclosure

- **HEADLESS:** All C3–C8 browser checks ran in headless Chromium. The owner does **not** see this window. Screenshots in `/tmp/audit-*.png` are MAC-SIDE artifacts of the headless run — they are not proof of what renders in the owner's own browser.
- **PRODUCTION (not preview):** All curl + Playwright targeted `https://messenginfo.com` directly, not a Vercel preview URL.
- **REAL backend, synthetic input:** OCR calls hit the real production endpoint and real Gemini. The input was the synthetic fixture (`TESTSURNAME/TESTGIVEN`), so C5's "TESTCORRECTED" and C4's row contents are from synthetic data, not a real client document.
- **NOT MOCKED:** no API was mocked in this audit (unlike Sessions 49–52, which the prior agent admitted mocking).
- **Secret not exfiltrated:** the Gemini key value was intentionally not pulled; C13's exact-signature sub-claim is therefore UNVERIFIED by choice.
- **Tests:** C12 verified directly this audit — `vitest run` returned 2124 passed / 1 skipped and `tsc` exit 0. Confirmed, not assumed.
