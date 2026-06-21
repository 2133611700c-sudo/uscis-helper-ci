# PROJECT_HISTORY.md — Messenginfo Product Timeline
Generated: 2026-05-23 | Source: git logs from all Messenginfo repos

---

## Overview

| Repo | Phase | Commits | Period | Status |
|---|---|---|---|---|
| `messenginfo` | v1 — freight verification | 40 | Oct 2025 → Jan 2026 | CLOSED |
| `messenginfo-canonical` | v1 canonical | 307 | Nov 2025 → Jan 2026 | CLOSED |
| `messenginfo-merge` | v1 merged | 772 | Nov 2025 → Feb 2026 | CLOSED |
| `uscis-helper` | v2 — immigration platform | 469 | Apr 2026 → May 2026 | ACTIVE |
| **TOTAL** | | **1588** | **Oct 2025 → May 2026** | |

**Entity:** SK Logistics LLC, Los Angeles, CA
**Domain:** messenginfo.com

---

## Phase 1: Freight Verification SaaS (Oct 2025 — Feb 2026) — CLOSED

**Product:** Carrier/broker verification for US freight industry. Tiers free to $149/month.
**Stack:** Next.js, Vercel, Supabase, n8n
**Result:** Zero paying customers. Business closed.
**Lesson:** AI filled knowledge gaps with speculation instead of acknowledging uncertainty. Led to lost time and money.
**Rule created:** Before any new direction — competitive analysis, real cost breakdown, explicit statement of unknowns.
**Also paused:** LoadParser.ai (email parsing for freight brokers) — evaluated, not released.

**Repos:** messenginfo (40), messenginfo-canonical (307), messenginfo-merge (772) = 1119 commits

---

## Phase 2: Immigration Platform (Apr 2026 — present) — ACTIVE

**Product:** Self-help immigration info + document translation drafts + USCIS draft forms
**Target:** Ukrainian immigrants in US (TPS, U4U, re-parole), 30-80 years old, mobile-first
**Legal basis:** Self-service translation under 8 CFR §103.2(b)(3), California safe harbor under Bus. & Prof. Code §22441(c)

**Key milestones:**
- Apr 29: First commit, monorepo (apps/web + packages/*)
- Apr 30: Architecture + legal structuring + 30-day plan session
- May 3: Re-parole U4U form support (I-131)
- May 10: TPS Robot Phase 3 — 94.4% auto-fill (17/18 fields)
- May 20: DL module — address, eye/hair color auto-extraction
- May 21: passportBooklet module — internal passport OCR (patronymic)
- May 22: All 10 roadmap phases done. 1923 tests, 181 PDF readback, 0 mismatches
- May 22: Translation module architecture + wizard + lab + rendering
- May 22: Dark mode site-wide. Homepage copy rewrite. Owner access layer
- May 23: Knowledge engine v1.2 — canonical dictionary + normalization
- May 23: Transliteration bugs fixed (ЗГ→Zgh, ALL-CAPS)
- May 23: city_of_birth + province_of_birth extraction from internal passport
- May 23: uscis_online_account extraction from I-797
- May 23: Oblast genitive→nominative auto-conversion (24 oblasts, DMS-verified)
- May 23: Manual input reduced: ~15 fields → 4 (phone, email, marital, SSN)
- May 23: Continuity system: STATUS/HANDOFF/SOURCE_OF_TRUTH/CHANGELOG/ADRs/CLAUDE.md
- May 23: 2006 tests total, 0 failures

**Repo:** uscis-helper (469 commits)

**Current metrics:**
- Auto-fill: 94.4% → targeting 100% with internal passport
- Tests: 2006 pass, 0 failures
- Document modules: 6 (passport MRZ, booklet, DL, I-94, EAD, I-797)
- PDF readback: 181 fields, 0 mismatches
- Languages: RU, UK, EN, ES
- USCIS forms: I-821 (01/20/25), I-765 (08/21/25), I-131 (02/27/26)

---

## Auxiliary: Telegram Scanner (Mar 2026)

Python scripts (Telethon/MTProto) scanning US legalization Telegram groups for Messenginfo leads.
Stored at `~/tg-scanner/` on Windows machine. Not part of main repo.

---

## Key Decisions

1. **Freight → Immigration pivot** (Mar 2026): Freight had zero customers. Immigration has real demand.
2. **Self-service, not legal advice** (Apr 2026): ADR-001. Information tool, not law firm.
3. **Dictionary v1.2 as canonical source** (May 2026): ADR-002. Single normalization for OCR, forms, translations.
4. **Extend pipeline, not rebuild** (May 2026): ADR-003. System is 94.4% complete. Fix gaps, don't start over.
5. **Historical authority preservation** (May 2026): ADR-004. Militsiya stays Militsiya.

---

## Product Vision

Messenginfo Phase 1 (now): TPS Ukraine — upload docs → auto-fill I-821/I-765 → translation → export.
Messenginfo Phase 2 (next): Scale to all immigration forms, add Spanish-speaking TPS market.
Messenginfo Phase 3 (future): Full USCIS form automation platform.
