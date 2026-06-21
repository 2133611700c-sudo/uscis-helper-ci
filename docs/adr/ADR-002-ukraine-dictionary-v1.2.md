# ADR-002: Canonical Ukraine terminology dictionary v1.2
Status: Accepted
Date: 2026-05-23

## Context
Multiple partial normalization paths caused drift across OCR, forms, translation, and review.

## Decision
`packages/knowledge` is the single canonical runtime source of truth for: KMU-55 transliteration, authority naming (3-layer: official/uscis/plain), historical issuer handling, geography corrections, controlling spelling conflict detection, patronymic protection, oblast genitive→nominative.

## Evidence
74 tests pass. Workspace linked. Sources verified: mvs.gov.ua, dmsu.gov.ua, czo.gov.ua.

## Supersedes
All older ad-hoc transliteration/glossary logic. `docs/UKRAINE_TERMINOLOGY_DICTIONARY.md` (v1.0).
