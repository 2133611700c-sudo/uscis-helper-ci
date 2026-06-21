# Mirror Translation Architecture — English mirror of a Ukrainian official document

Date: 2026-06-10
Status: ENABLED in prod (`MIRROR_PDF_ENABLED=1`, commit 892d404). Route is fail-open: any mirror-render error falls back to the generic certification PDF. Visual layout/font/stamp-position review on a synthetic doc still PENDING owner sign-off (text content verified by extraction; visual not).

## SEMANTIC CLASSIFICATION (read before relying on this)

**The Mirror PDF is an ADVISORY TRANSPARENCY / UX layer — NOT a validation control.**
It renders, line-by-line, whatever the extraction produced (marking uncertain →
`[CONFIRM]`, missing → `[enter from document]`, never inventing). It does NOT
verify, gate, or guarantee correctness, and the route deliberately fails open to
the generic PDF — so it is OUTSIDE the safety chain. All safety guarantees live in:
`confirmedValueGuard` + the source-script gate (`isNameSourceScriptAmbiguous`) +
the C3 `finalValue` contract (`applyOcrFieldSafety`). Do NOT reason "we have the
mirror, so the value is validated" — that is a semantic-drift error. The mirror
shows the read; the guards decide what may be released.

## Goal

When a user translates a Ukrainian official document, the output PDF must be a
**faithful English MIRROR** of that document — its fields, in the order and grouping
the state form actually uses (per its normative act) — not a spontaneous field
table. We already generate the official USCIS-form PDFs; this brings the same
"structure from the source of truth" discipline to translations.

## What "mirror" means here (expectation calibration)

A **structural** mirror in English, not a pixel clone of the original. It reproduces:
- the document title (per the official act),
- the field groups and order (CHILD / PARENTS / ACT RECORD / STATE REGISTRATION …),
- the official source citation (KMU act + URL) for traceability,
- placeholders for non-text elements: `[ State Emblem ]`, `[ Official round seal — not reproduced ]`, `[ Signature of the head … ]`.

It deliberately does NOT redraw the coat-of-arms, seals, or borders — a certified
translation is a faithful rendering of the TEXT, not a visual reproduction of the
original (reproducing seals/emblems would misrepresent it as the original document).

## What existed vs what was missing (zero-trust reality)

EXISTED (well-built, but orphaned):
- `forms/ukraine/schemas/*` — 5 official schemas (birth, marriage, divorce, death,
  name-change), each tied to an `officialSource` (e.g. KMU No.1025). Per-field:
  `sourceLabelUk/En`, `fieldGroup`, `expectedScript`, `translationRule`, `lockedEntity`.
- `pdf/templates/ukraine/renderOfficialTranslation.ts` — a generic mirror renderer
  that draws ANY schema by `layoutSections` + `fieldGroup`.

MISSING (the wiring — built now):
- No `docType → schema` registry.
- No bridge from EXTRACTION field keys (registry: `child_family_name`, `dob`) to
  SCHEMA keys (`child_surname`, `date_of_birth`). The renderer was fed ONLY by
  `mockOCR.ts` — never by real extracted data.
- The live `generate-pdf` route called the generic `generateTranslationPDF`, not the mirror.

## The bricks (data flow)

```
upload → readDocument → extracted fields (registry keys; KMU-55 Latin + raw_cyrillic; review flags; final_value after C3)
  → getOfficialSchema(docType)                     [NEW] forms/ukraine/schemas/registry.ts
  → buildMirrorValues(schema, extracted)           [NEW] pdf/buildMirrorValues.ts
        · alias map: registry key → schema key (child_family_name→child_surname, dob→date_of_birth, …)
        · finalValue-first release value (Phase 3 / C3 contract)
        · review→[CONFIRM]; missing→blank→[enter from document]; never invents
  → renderOfficialTranslation(schema, values)      [EXISTING] mirror PDF by official layout
  ← renderMirrorTranslationPDF(...)                [NEW] orchestrator (returns null if no schema)
  → generate-pdf route: MIRROR_PDF_ENABLED=1 AND hasOfficialSchema(docType) ? mirror : generic
```

## Coverage (honest)

| docType | schema | extraction (registry) | mirror today |
|---|---|---|---|
| ua_birth_certificate | ✓ | 10 fields, good map | **strong** (best case) |
| ua_marriage_certificate | ✓ | 4 fields (sparse) | partial — person names mostly `[enter from document]` |
| ua_divorce_certificate | ✓ | 3 fields (sparse) | partial |
| ua_death_certificate | ✓ | no registry spec | manual-entry only |
| ua_name_change_certificate | ✓ | no registry spec | manual-entry only |

The mirror renderer is generic, so all 5 render; accuracy of the AUTO-FILLED portion
is bounded by what extraction returns. Birth cert is the proof vehicle (schema + GT
+ bench). Improving marriage/divorce auto-fill = enriching their docintel registry
specs (separate work).

## Rollout

`MIRROR_PDF_ENABLED` default OFF → live PDF unchanged (generic, byte-identical).
Owner flips to `1` after reviewing a sample mirror PDF for the birth cert. The
mirror path is also gated by the same upstream guards (payment, reviewGate,
confirmed-value guard) — it only changes the final RENDER, not the safety chain.

## [OWNER DECISIONS]
1. Is the structural-mirror format the desired certified output (vs the current generic table)? Review a sample, then flip the flag.
2. Marriage/divorce auto-fill is sparse — enrich their extraction specs, or accept manual entry for the person fields?
3. Death / name-change have schemas but no extraction — keep as manual-entry mirrors, or add specs?

## Tests
`pdf/__tests__/mirrorTranslation.test.ts` — registry lookup, key mapping (finalValue-first,
blanks, no-invent), end-to-end real PDF buffer, null fallback for non-schema docTypes.
