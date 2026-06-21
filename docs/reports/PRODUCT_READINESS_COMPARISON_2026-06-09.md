# Product readiness comparison — TPS / Translator / Reparole / EAD (2026-06-09)

Sources: PRODUCT_RUNTIME_ARCHITECTURE (06-03), ONE_BRAIN_FINAL_STATUS (06-03, flags owner-verified ON),
ACTUAL_PRODUCT_CALL_GRAPH, zero-trust audit (06-09), 5 surface maps (this session), knowledge inventory synthesis,
P0 incident forensics (06-06), Cyrillic Constitution (06-09). Read-only; no PII.

## Verdict in one line
**The four products are at FOUR different stages of the same migration** — and the flagship (Translator) has the
WORST hard-case-Cyrillic story: its birth/marriage docs bypass the brain entirely (`auto:false` → manual ticket),
which was incident root-cause RC-1 and is still true.

## Matrix

| Dimension | Translator (flagship) | TPS | Reparole | EAD (право на работу) |
|---|---|---|---|---|
| UI wizard | 7 steps, most polished (review-before-pay, signature, certification, audit) | 6 steps, mature (completeness checker, translation bridge) | 5 steps, 4 langs, complete | Wizard live, thinnest UX |
| UI gaps | Lab "upload your own" = coming-soon; suggested_value not shown | — (minor) | I-131 1.e checkbox manual; family/travel rows not in v1; status_at_last_entry unmapped | address manual (no DL step); I-94 fields not prefilled |
| Reader TODAY (flags ON in prod) | Gemini (Core B2 + legacy Gemini merge fallback) | **Google Vision/DocAI + 8 rule modules = DEFAULT**; Gemini-Core only passport/booklet | Gemini-Core passport/booklet (+MRZ authority — cleanest); i94/ead/dl → TPS route | Gemini-Core ONLY (no legacy; 503 if flag off) |
| Hard-case Cyrillic (birth/marriage) | **BYPASSED: `auto:false` → vision-extract NOT called → manual ticket** (RC-1, still true) | rule modules + dual-OCR crossref, UNGATED (RC-5 fallback) | n/a (passport/booklet only) | n/a (US docs) |
| Dictionaries (D2) on output | place/oblast at Door A only; patronymic/authority dark (SMART OFF); translator UI misses normalizePlace/oblast | postExtractNormalize applies oblast/place (best today) | via docintel door (Door A) | via docintel door; US docs mostly Latin-preserve |
| Anti-invention / source gates | review gate live (PR #84); C3 wired OFF | slot firewall + contracts; legacy ungated paths remain | adapter preserves review; MRZ authority | **strictest: type-level `invented_fields_count: 0`** source gates |
| US-doc registry proof | n/a | rule modules proven | falls back to TPS for US docs | **docintel specs for ead/i94/i797 UNPROVEN in registry** (PRODUCT_RUNTIME flags UNKNOWN); no upright real EAD/I-94 fixture → unscorable |
| Payment/PDF | Stripe $14.99 + certified PDF + audit table — solid | I-821/I-765 packet + Stripe — mature | I-131 PDF+README zip, $15 | generate-packet exists, least exercised |
| Tests (per ONE_BRAIN_FINAL + session) | B2 merged, suite green | B1 merged | B3 merged | 74 adapter + 45 UI wiring tests |
| **Pipeline alignment to Constitution** | 60% (3 branches: Core/central-brain/legacy) | **40% (biggest non-Gemini holdout)** | **85% (closest to target)** | 80% (cleanest arch, least proven on real docs) |
| **Product maturity** | 90% | 90% | 75% | 60% |

## Key asymmetries (what the comparison actually says)

1. **Reparole is the architectural reference** — Gemini-Core + MRZ-authority + no ungated fallback for covered
   slots. Phase-2 work should converge the others to ITS shape (it already matches the Constitution).
2. **TPS is the big migration target** — the only product whose DEFAULT reader is not Gemini (Vision/DocAI + 8
   rule modules), with ungated legacy paths (RC-5). But its rule modules for US forms (i94/ead/dl/i797) are
   deterministic and GOOD — the Constitution keeps Vision/MRZ as the technical eye; US-form rule modules can stay
   deterministic. The UA-doc paths (booklet/birth/military) are what must converge to the Core.
3. **The flagship paradox:** Translator is the most polished product UI-wise and the WORST on exactly the
   documents Cyrillic matters most — birth/marriage are `auto:false`, never reach the brain, go to a manual
   ticket. The whole rebuilt safety stack (hard-case policy + C3 + D2) makes auto-read SAFE now (candidate≠final,
   forced review, real-doc proven 06-09) — the `auto:false` bypass is legacy fear, not current necessity.
4. **EAD is clean but unproven** — Core-only architecture and the strictest anti-invention gates, but the docintel
   registry's US-doc specs are unproven and there are no scorable real fixtures. Lowest functional maturity
   (manual address, no I-94 prefill).

## Comparison with the current rebuild work (does my work serve the gaps?)

- Phase 1 (D2 authority + shared helper + contract + Constitution) lands at the SHARED door/arbitration → benefits
  all 4 products at once. Correct placement confirmed by this comparison (no per-product work wasted).
- But D2's Cyrillic value is blocked by GAP A (raw_cyrillic dropped) → Phase 2.0 stays the right next code step.
- **Missing from my plan until now (added):** the flagship `auto:false` bypass. Routing Translator birth/marriage
  through the Core under hard-case policy + C3 (auto-read → candidate+review instead of zero-read → manual
  ticket) is the single highest-impact PRODUCT fix and uses everything already built. Phase 2 gets it as 2.1a.
- TPS convergence (2.2) = narrow: UA-doc hints → Core; keep deterministic US-form modules + Vision/DocAI as the eye.
- EAD needs a registry-proof task (do `us_ead`/`us_i94`/`i797` DocTypeSpecs exist & are they correct?) before any
  claim that EAD reading is trustworthy.

## Priority (mentor recommendation)
1. Phase 2.0 (raw_cyrillic → D2 at the one door; fixes the dictionary value for ALL products).
2. **2.1a Translator hard-case unbypass** (`auto:false` → Core + hard-case review + C3) — flagship, incident-class fix.
3. 2.2 TPS UA-doc convergence to Core (booklet/birth/military), keep US-form rule modules.
4. EAD registry proof + real fixtures (owner: upright EAD/I-94 images).
5. Tabs polish (Lab upload, I-131 1.e, EAD address/I-94 prefill) after the safety spine.

Owner-gated throughout: GT from different people (model selection + any dictionary prod-enable); prod flags.
