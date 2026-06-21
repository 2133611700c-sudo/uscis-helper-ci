# GT Language Intent (decision) — value = as-written, normalized = canonical

> **CORRECTION 2026-06-04 (owner, hard):** the product's documents are **Ukrainian**. So "as-written" =
> **Ukrainian** text. If the model returns a **Russian form** of a Ukrainian name/patronymic/place (e.g.
> a `-ій` name as `-ей`, a dropped apostrophe `ʼ`, `і/ї/є/ґ` Russianized, a Ukrainian month misread), that
> is a **WRONG read / language substitution = a real model ERROR to penalize**, NOT a normalization choice.
> The earlier wording below ("a Soviet/Russian-language certificate stores the Russian form") is the
> exception case, not the rule — for these Ukrainian docs, GT is Ukrainian, full stop. Recognition is
> Ukrainian → English; KMU-55 transliteration happens only AFTER a correct Ukrainian read.


**Date:** 2026-06-04  **Status:** DECIDED (owner). Binds all future GT fills + accuracy scoring +
the OneBrain `decideField` contract. docs-only; no runtime change.

## Decision

- **`value` (and `*_cyrillic`/`*_raw` GT fields) = AS WRITTEN ON THE DOCUMENT.**
  A Soviet/Russian-language certificate stores the Russian form (e.g. the given name/patronymic exactly
  as printed). A Ukrainian document stores the Ukrainian form. The GT records what a human READS on the
  page — the document's own truth.
- **`normalized_value` (and `*_latin`/`*_english`) = canonical form, when needed** (KMU-55 Latin, ISO date,
  Ukrainian canonical). This is DERIVED and SEPARATE — it never replaces `value`.
- **dictionary_signal = hint / conflict only, never a silent overwrite.** A dictionary may suggest a
  canonical form or flag a mismatch and raise `review_required`; it must not rewrite `value`.

## Why (evidence)

The 2026-06-04 accuracy run scored low partly because the docs are Russian-language but the first GT was
recorded in Ukrainian canonical form — exact-match then penalized the model for reading the document
CORRECTLY (Russian) against a Ukrainian GT. That is a measurement artifact, not a model error. Storing
`value` as-written fixes it: the reader is scored against the document's actual text; canonicalization is
a separate, auditable transform.

## Consequences for scoring

- Accuracy compares the read's RAW layer (`raw_cyrillic`) to GT `value` (as-written).
- Canonical/translation accuracy (if scored) compares the normalized layer to `normalized_value`.
- A RU↔UA spelling difference between `value` and `normalized_value` is EXPECTED, not a failure.
- `candidate_not_verified` fields are never penalized (see calibration plan).

## Consequences for OneBrain

This is exactly the `value` vs `normalized_value` split already in `ONEBRAIN_DECIDE_FIELD_CONTRACT.md`:
`value` from the reader (as-written), `normalized_value` from a dictionary signal (canonical), dictionaries
never overwrite. No code change here — this decision validates the contract's shape.
