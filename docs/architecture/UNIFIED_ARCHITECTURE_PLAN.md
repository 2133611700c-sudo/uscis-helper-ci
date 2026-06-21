# UNIFIED ARCHITECTURE PLAN — Messenginfo
**The complete target model: one case → one upload → all outputs.**
Author: engineering. Status: design (approved scope pending). Date: 2026-06-12.

This is the single source of truth for HOW the whole product is wired: what each
service is, what shares what, what to build, what to rebuild, in what order.

---

## PART 0 — THE ONE-SENTENCE TRUTH

> One Ukrainian user has ONE immigration situation, uploads a FEW documents ONCE,
> and from those same documents we produce: (a) filled USCIS forms, (b) certified
> English translations, (c) a complete filing packet — as ONE order, ONE price,
> ONE archive.

Everything below exists to make that sentence true. Today it is NOT true: each
product re-implements upload, extraction shaping, payment, and delivery on its own,
and translation is a separate purchase. The fix is not "build a 5th thing" — it is
to make the ONE spine we already half-have carry all the way through.

---

## PART 1 — THE PRODUCTS (what each is, who it's for, what form)

| Product | USCIS form(s) | What the user gets | Who it's for |
|---|---|---|---|
| **TPS (Ukraine)** | **I-821** (+ optional **I-765**) | TPS application packet | Ukrainians applying for / renewing Temporary Protected Status |
| **Re-Parole (U4U)** | **I-131** | Re-parole application packet | Uniting-for-Ukraine parolees re-applying |
| **Work Permit (EAD)** | **I-765** | Work authorization packet | Anyone eligible for an EAD (c08/c11/a12…) |
| **Translation** | — (no form) | Certified English translation PDF | Anyone needing a USCIS-acceptable translation of a UA document |

**Document inventory (everything we read), by `docType`:**
- Ukrainian identity: `ua_international_passport`, `ua_internal_passport_booklet`, `ua_id_card`, `ua_military_id`
- Ukrainian civil acts: `ua_birth_certificate`, `ua_marriage_certificate`, `ua_divorce_certificate`, `ua_death_certificate`, `ua_name_change_certificate`
- US documents: `us_i94`, `us_ead`, `us_i797` (+ driver's license)

**The non-obvious overlap (why a shared spine pays off):** the SAME passport / I-94 /
EAD feed I-821, I-131, AND I-765. The SAME birth/marriage certificate is BOTH a
packet attachment AND a translation job. One document, many consumers.

---

## PART 2 — THE TARGET SPINE (the architecture)

```
                          ┌──────────────────────────────────────────┐
                          │              ONE WIZARD SHELL             │
                          │  product pick → upload → needs → cart →   │
                          │  pay → (operator) → archive               │
                          └───────────────────┬──────────────────────┘
                                              │ files + product context
                                              ▼
   ┌───────────────────────────── DOCUMENT CORE ──────────────────────────────┐
   │  readDocument (vision) → arbitrateDocument (one judge, MRZ/dict/review)   │
   │  + cross-document identity merge (multi-doc → one person)                 │
   └───────────────────────────────────┬──────────────────────────────────────┘
                                        │ emits
                                        ▼
                          ┌──────────── CANONICAL DOCUMENT ────────────┐
                          │  CanonicalDocumentResult                   │
                          │  { docClass, CanonicalField[], evidence,   │
                          │    controllingSpelling, reviewState }      │
                          │  ── THE SINGLE CURRENCY everyone reads ──   │
                          └──────┬───────────────┬───────────────┬─────┘
                                 │               │               │
                ┌────────────────▼──┐   ┌────────▼─────────┐   ┌─▼─────────────────┐
                │   FORM MAPPER     │   │ TRANSLATION      │   │  PACKET BUILDER   │
                │ (form, canonical) │   │ BUILDER          │   │ forms + originals │
                │   → PrefillOp[]   │   │ (canonical →     │   │ + translations    │
                │  I-821 I-765 I-131│   │ mirror PDF)      │   │   → ONE archive   │
                └─────────┬─────────┘   └────────┬─────────┘   └────────┬──────────┘
                          │                      │                      │
                          └──────────────────────┴───────────┬──────────┘
                                                              ▼
                          ┌──────────── ORDER / CART / PRICING ─────────┐
                          │ one order = base package + line items       │
                          │ (required translations included, optional   │
                          │ translations + complexity surcharge added)  │
                          └───────────────────┬─────────────────────────┘
                                              ▼
                          ┌──────────── OPERATOR QUEUE + DELIVERY ──────┐
                          │ one ticket per order → one archive out      │
                          └─────────────────────────────────────────────┘
```

**Reading rule:** every box BELOW Canonical Document reads `CanonicalField[]` and
nothing else. No product-specific answer type past this line. That single rule is
what makes the system "one construction" instead of four.

---

## PART 3 — THE CANONICAL MODEL (the single currency)

Already exists as a TYPE (`apps/web/src/lib/canonical/types.ts` → `CanonicalDocumentResult`,
`CanonicalField`). Today it is built and then THROWN AWAY (re-shaped into TPSAnswers
/ ReParoleAnswers / EadFieldData / translationRows). The plan keeps it as the ONLY
hand-off.

```ts
CanonicalDocumentResult {
  docClass: 'ua_international_passport' | 'us_i94' | 'ua_birth_certificate' | ...
  fields: CanonicalField[]
  pageCount: number
  reviewState: 'clean' | 'needs_review' | 'unreadable'
  source: { engine, ms, model }
}
CanonicalField {
  key: 'family_name' | 'given_name' | 'date_of_birth' | 'i94_admission_number' | ...
  value: string                 // final, normalized, English/Latin
  rawCyrillic: string | null    // what was printed (for the mirror)
  controlling: boolean          // MRZ/printed-Latin authority (never re-transliterate)
  reviewRequired: boolean
  reviewReasons: string[]
  evidence?: { page, bbox }
}
```

**Field taxonomy (one vocabulary, used by ALL forms + translations):** identity
(family_name, given_name, patronymic, date_of_birth, sex, place_of_birth,
nationality), document (passport_number, card_number, a_number, i94_admission_number,
ead_category, dates), civil-act (act_record_number, place_of_registration,
issuing_authority, spouse_*, deceased_*). A field is named ONCE; the dob/middle_name
aliasing currently re-coded in every adapter dies.

---

## PART 4 — PER-PRODUCT STRUCTURE (forms × documents)

**Which document fills which form field** (this is the Form Mapper's job table):

| Document → | I-821 (TPS) | I-131 (Re-Parole) | I-765 (EAD) | Translation |
|---|---|---|---|---|
| Int'l / booklet passport | name, DOB, country, passport# | same | same | ✅ certified PDF |
| I-94 | admission#, class, entry date | admission#, class | admission#, class | (English already) |
| EAD (prior) | category, A# | A# | A#, category, dates | (English already) |
| I-797 | receipt#, A# | — | A# | (English already) |
| Birth certificate | — (attachment) | — (attachment) | — | ✅ **required** for many cases |
| Marriage / divorce | — (attachment) | — | — | ✅ if name change |
| Military ID | — | — | — | ✅ optional |

**Two roles every document can play, decided by the Document Core's docClass +
the product:**
1. **FORM SOURCE** — its fields prefill a USCIS form (passport→I-821).
2. **PACKET ATTACHMENT** — the original (and its translation) go INTO the filing
   (birth certificate→translated→attached).
A document can be BOTH (passport: fills the form AND, for some cases, is attached +
translated). The Core decides; the user confirms.

---

## PART 5 — THE SHARED SERVICES (responsibilities)

### 5.1 Document Core  — `lib/docintel` + `lib/canonical/core`  *(EXISTS, shared)*
- `readDocument(file, docType)` → vision read (Gemini), MRZ authority, dictionary,
  review gates. **All 4 products already call this.** ✅
- `arbitrateDocument(candidates)` → one judge (MRZ wins, controlling-Latin verbatim,
  dictionary applied, conflicts → review). ✅
- **MISSING:** cross-document identity merge (passport + I-94 + EAD → ONE person with
  one canonical name/DOB). Today this lives ONLY in `lib/tps/centralBrain.ts`
  (TPS-only). → Promote it into the Core as a "session merge" stage that emits ONE
  `CanonicalPerson` + N `CanonicalDocumentResult`.

### 5.2 Form Mapper  — *(PARTIAL — engine shared, maps per-product)*
- Shared engine EXISTS: `lib/tps/pdfPrefiller.prefill()` + `PrefillOp` + `assertFormIntegrity`. ✅
- Per-form maps are hand-written against PRODUCT answer types: `i821FieldMap`,
  `i765FieldMap` (TPS), `i131FieldMap` (reparole), `eadI765FieldMap` (EAD — a SECOND
  i-765 map). → Rewrite each as `(CanonicalField[]) → PrefillOp[]`; one i-765 map for
  TPS+EAD; delete the duplicate.

### 5.3 Translation Builder  — *(EXISTS but welded to Translation/TPS)*
- `renderMirrorTranslationPDF(docType, fields)` → the certified mirror PDF. ✅ (now
  live for all 9 UA doc types, verified on real docs).
- Today reachable from TPS only via `lib/tps/translationBridge.ts`; Re-Parole and
  EAD CANNOT translate a doc they already extracted. → Lift to
  `TranslationBuilder.fromCanonical(canonical, signer)` — a product-agnostic service
  any flow calls.

### 5.4 Packet Builder  — *(3 separate builders, shared PDF engine only)*
- `tps/packetBuilder` (full ZIP + README + bundled passport translation),
  `reparole/packetBuilder` (single I-131), `ead/packetBuilder` (single I-765). → One
  `PacketBuilder.assemble({ forms: PrefillOp-sets, originals, translations }) → ZIP`,
  used by all three.

### 5.5 Order / Cart / Pricing  — *(MISSING — flat single-price checkouts)*
- Today: 3 independent single-line Stripe checkouts (TPS $15, Re-Parole $15,
  Translation $14.99) + EAD free. Translation for a non-passport doc = a SEPARATE
  order/table/queue. No cart, no line items, no surcharge.
- → Build an `orders` + `order_items` model + a cart that computes
  `base + required-translations(included) + optional-translations + complexity` and
  one Stripe session (dynamic `line_items`).

### 5.6 Operator Queue + Delivery  — *(translation-only today)*
- Only standalone translations enter `manual_review_queue`; TPS/Re-Parole/EAD are
  self-serve ZIPs → "two orders, two queues, manual linking" (owner's exact fear). →
  One ticket per ORDER; one archive (forms + originals + translations) out.

---

## PART 6 — EXISTS / BUILD / REBUILD (the gap table)

| Capability | State | Action |
|---|---|---|
| Vision read + arbitration (`readDocument`/`arbitrateDocument`) | ✅ shared, all 4 | keep |
| `CanonicalDocumentResult` type | ✅ exists | **make it the only hand-off** (stop discarding) |
| Cross-doc identity merge | ⚠️ TPS-only (`centralBrain`) | **promote to Core** |
| PDF prefill engine (`prefill`/`PrefillOp`) | ✅ shared | keep |
| Form maps (I-821/I-765/I-131) | ⚠️ per-product, duplicate i-765 | **rebuild as canonical→PrefillOp; dedupe** |
| Mirror translation builder | ✅ exists (live, real-doc verified) | **lift to shared `fromCanonical`** |
| Packet assembly | ⚠️ 3 builders | **one `PacketBuilder.assemble`** |
| Order / cart / line items | ❌ none (flat price) | **build `orders`+`order_items`+cart** |
| Translation as add-on line | ❌ separate checkout/table/queue | **make it a line item on the parent order** |
| Pricing tiers (per-page/complexity) | ❌ flat | **build pricing engine (tier by docClass/pages)** |
| EAD payment | ❌ free, no Stripe | **add to unified checkout** |
| Re-Parole packet payment gate | ❌ ungated | **gate on order entitlement** |
| Operator queue | ⚠️ translation-only | **one ticket per order** |
| Unified wizard shell | ❌ 4 separate wizards | **extract one shell (later phase)** |
| One archive out | ⚠️ TPS partial | **shared archive from PacketBuilder** |

---

## PART 7 — THE ORDER & PRICING MODEL (one cart)

```
order
 ├─ product: 'tps' | 'reparole' | 'ead' | 'translation'
 ├─ base_package_price
 └─ items[]
      ├─ { kind:'form',        ref:'I-821',           price: 0   (in base) }
      ├─ { kind:'form',        ref:'I-765',           price: 0   (in base, concurrent) }
      ├─ { kind:'translation', docId, docClass, pages, required:true,  price: 0 (included) }
      ├─ { kind:'translation', docId, docClass, pages, required:false, price: +X (optional) }
      ├─ { kind:'surcharge',   reason:'handwritten/complex',           price: +Y }
      └─ { kind:'review',      reason:'operator review',               price: in base }
 = order_total (FIXED before pay)
```

**Pricing tiers (by docClass + pages, not one flat price):**
- Tier A — simple 1-page (ID card, EAD) 
- Tier B — certificate 1–2 pages (birth/marriage/divorce)
- Tier C — booklet / multi-page passport
- Manual — handwritten / degraded (operator quote)

**Required vs optional translation (the Core decides, the cart shows):**
- The Core flags each uploaded doc: needs-translation? goes-in-packet? form-source-only?
- "Required for this packet" → included or a clearly-labeled required line.
- "Optional" → user opts in; we never auto-sell.

**One Stripe session** with dynamic `line_items` (or computed `price_data`), amount
locked at order creation so the post-processing page count never changes the total.

---

## PART 8 — THE UNIFIED WIZARD (one flow, replaces 4)

```
1. PICK PRODUCT            TPS / Re-Parole / Work Permit / Just a Translation
2. A FEW QUESTIONS         (product-specific: filing type, category, online/paper)
3. UPLOAD DOCUMENTS        one multi-slot/multi-page uploader (same component)
4. SYSTEM ANALYSIS         "Found 4 documents:
                            ✓ Passport — no translation needed (fills the form)
                            ✓ I-94 — no translation needed
                            ✓ Birth certificate — translation REQUIRED for the packet
                            ✓ Booklet — translation of 2 pages required"
                           [Add all required translations]  [Choose manually]
5. REVIEW (see-before-pay) extracted form fields + translations preview, edit inline
6. CART                    base + included + optional + surcharge = total
7. PAY                     one Stripe checkout
8. (OPERATOR)              one ticket: review forms + sign translations
9. ARCHIVE                 one ZIP: forms + originals + certified translations + README
```

The standalone "Just a Translation" path is the SAME wizard with product=translation
and no form step — not a separate codebase.

---

## PART 9 — PHASED BUILD PLAN (dependency order; each phase ships + is real-doc verified)

**Guard rails (every phase):** real-doc verification via `liveRealDocs.test.ts`
harness before claiming done; no silent prod flips; fail-open; keep `CanonicalField`
the only currency past the Core.

- **Phase 1 — Canonical as the only currency.** Form Mapper + Translation Builder
  read `CanonicalField[]` directly. Delete the per-product *Answers re-shaping and
  the dob/middle_name aliasing duplicated in each adapter. *Highest leverage; reconnects
  the severed spine. No user-visible change — pure internal convergence.* Verify each
  form still fills correctly from the real passport/I-94/EAD reads.

- **Phase 2 — Shared Form Mapper + dedupe i-765.** One `(form, canonical) → PrefillOp[]`
  module; fold I-821 / I-765(TPS) / I-765(EAD) / I-131 into it; one i-765 map. Verify
  filled PDFs byte-match the current output on the real docs.

- **Phase 3 — Translation Builder as a shared service.** `TranslationBuilder.fromCanonical`;
  Re-Parole and EAD can now translate an uploaded doc. Verify on the real birth cert.

- **Phase 4 — One PacketBuilder + the order/items model.** `orders`+`order_items`
  schema; one `assemble()` → one archive. Translation becomes a LINE ITEM on the
  parent order (kill the external translate link). Re-Parole packet gated on the order.

- **Phase 5 — Cart + pricing engine + unified checkout.** Tiered pricing by
  docClass/pages; dynamic Stripe line items; EAD joins the checkout; price fixed
  pre-pay; the "system analysis → cart" screen.

- **Phase 6 — One operator queue per order; one archive delivery.** Every paid order
  → one ticket; operator signs translations + reviews forms; one ZIP/email out.

- **Phase 7 — Unified wizard shell.** Extract the 4 wizards into one shell + product
  config (last, because it's cosmetic-but-large; the value is in 1–6). Fix the menu
  inconsistencies, the localization fallbacks, the price label mismatches.

**Why this order:** 1–3 are pure internal convergence (no user risk, big debt
payoff). 4–6 deliver the owner's "one order / one cart / one queue / one archive".
7 is the visible unification once the plumbing is one thing.

---

## PART 10 — DATA MODEL (target)

```
orders(id, user_id, product, status, base_price, total_price, stripe_session, created)
order_items(id, order_id, kind, ref, doc_id, doc_class, pages, required, unit_price, total_price, reason)
documents(id, order_id, doc_class, storage_ref, page_count, canonical_json, review_state)
translations(id, order_id, doc_id, doc_class, mirror_pdf_ref, signer, signed_at, status)
operator_tickets(id, order_id, status, assignee, notes)   -- ONE per order
```
Replaces today's 3 incompatible models (`translation_orders`, `wizard_sessions`,
localStorage-only TPS).

---

## PART 11 — INVARIANTS / NON-NEGOTIABLES (carry forward, never regress)

1. **Controlling Latin wins** — MRZ/printed romanization (TARAS) beats KMU-55
   re-transliteration. (Verified on the real passport.)
2. **Never fabricate** — a field not on the document → blank, never inferred. (oblast
   lesson.) Anti-fabrication prompt + no low-yield separate fields.
3. **Ukrainian stays Ukrainian** — strong anti-Russification reader prompt; RU routing
   flag-gated.
4. **Never silently substitute** — dictionary conflict → review + suggestion (renamed
   cities, oblast cases), never a silent overwrite.
5. **See-before-pay** — the user reviews extracted data + translation preview before
   paying.
6. **One upload, many uses** — never make the user upload the same document twice.
7. **Fail-open** — any new layer that errors falls back to the prior working output.
8. **Real-doc verified** — `liveRealDocs.test.ts` before "done".

---

## PART 12 — WHAT THIS GIVES THE OWNER

- **For the user:** one flow, one price, one archive; no leaving the wizard, no double
  payment, no re-uploading, translations included where required.
- **For the business:** sell the package + priced add-on translations (tiered by real
  work), not a flat fee; EAD monetized; cross-sell translations inside the form flow.
- **For engineering:** one spine instead of four; one form mapper, one translation
  builder, one packet builder, one order model; the legacy TPS module switch retires
  slot-by-slot; new products = config, not a new codebase.

---
*End of plan. Phases are independently shippable; start = Phase 1 (canonical-only
currency). Each phase gated on real-document verification.*
