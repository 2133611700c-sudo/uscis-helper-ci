# Document Platform Coverage Report
**Date:** 2026-05-29 · **Mode:** zero-trust, evidence-based (not from optimistic reports)

> Honest stance: this is a **7.5/10 foundation, not a finished product**. "5 civil schemas"
> = birth FULL + 4 DRAFT. Runtime 5/10, production 4/10. **0 documents active** (BUREAU_PDF off).
> Many green unit tests ≠ product readiness.

## Coverage matrix (per document_type)
| doc_type | source | schema | contract | mapping | renderer | review gate | fixture E2E | **active** | blockers |
|---|---|---|---|---|---|---|---|---|---|
| **birth_certificate** | ✅ КМУ-1025 verified | ✅ full | ✅ | ✅ | ✅ (flag) | ⚠️ route-level only | ✅ live | **NO** | visual approval, merge, per-doc review gate |
| marriage_certificate | ✅ КМУ-1025 | ✅ contract | ✅ | ❌ | generic | ❌ | ❌ synthetic | NO | mapping, fixture, deeper fields |
| divorce_certificate | ✅ КМУ-1025 | ✅ contract | ✅ | ❌ | generic | ❌ | ❌ | NO | mapping, fixture |
| death_certificate | ✅ КМУ-1025 | ✅ contract | ✅ | ❌ | generic | ❌ | ❌ | NO | mapping, fixture |
| name_change_certificate | ✅ КМУ-1025 | ✅ contract | ✅ | ❌ | generic | ❌ | ❌ | NO | mapping, fixture |
| international_passport | ✅ КМУ-152 | ❌ no bureau schema | — | ❌ | ❌ | — | ✅ live (MRZ) | NO | bureau schema |
| id_card | ✅ КМУ-302 | ❌ | — | ❌ | ❌ | — | ❌ | NO | bureau schema |
| internal_passport_booklet | 🟠 КМУ-353 appendix not published | engine-only | — | ❌ | ❌ | — | ❌ | NO | no official blank |
| military_id | 🔴 INVALID URL | engine-only | — | ❌ | ❌ | — | ✅ live core | NO | correct official source |
| education / pension / driver | 🔴 invalid/incomplete | ❌ | — | — | — | — | ❌ | NO | source |

**Production active: 0.**

## Cross-cutting status
- **Review Gate:** `/render` enforces (critical-fields-confirmed + signed cert + manual-review block). `generate-pdf` **now hard-blocks** (this PR: review-confirmation + signerName; signerAddress = warning until wizard collects it). ZIP path already gates on `reviewConfirmed`.
- **Sources:** VERIFIED КМУ-1025 / 152 / 302. INVALID/incomplete: military, education, pension, КМУ-353 booklet appendix, КМУ-1367/ВРУ-2503.
- **Geography:** main = ~74 seed places; 458-city КАТОТТГ stranded on `koatuu` (unmerged). КОАТУУ legacy absent. Not byte-verified.
- **Agency glossary:** ~56 abbr; missing ПФУ/КМУ/Мінрегіон/МОН/МОЗ. Unknown→review works.
- **Branch stack:** 4 unmerged branches; official-docs missing КАТОТТГ → build on sand until #26/#27 merge.

## Pilot decision
**`ua_birth_certificate` = the ONLY pilot.** marriage/divorce/death/name-change stay **DRAFT** until per-doc mapping + real fixture E2E + visual PDF approval. No new document types until birth pilot passes (playbook P0/P2).

## Recommended sequence (playbook)
S0 merge #26 → #27 → rebase official-docs · S1 review-gate (this PR) · S2 accept ADR-015 ·
S3 official-docs diff audit · S4 birth pilot (flag + visual + fixture) · then marriage.
