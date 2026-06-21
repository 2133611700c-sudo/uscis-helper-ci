# ADR: Central Brain Architecture

**Status:** PROPOSED  
**Date:** 2026-05-24  
**Context:** Live browser tests show 35% auto-fill vs spec's 94.4%. Root cause: no central coordinator.

## Problem

TPS pipeline and Translation Engine are two separate systems that don't communicate.
Translation Engine has PacketIdentityAnchor, agencyGlossary, validators — but TPS doesn't use them.
TPS wizard merge is a client-side useMemo — no source priority, no cross-validation, no hallucination guard.

## Decision

Build Central Brain — server-side coordinator at `apps/web/src/lib/tps/centralBrain.ts`.

### New files:
- `centralBrain.ts` — orchestrator
- `hallucinationGuard.ts` — plausibility + cross-validation
- `dictionaryBridge.ts` — bridge to translation glossary
- `sourcePriority.ts` — controlling spelling resolver
- `plausibilityCheck.ts` — field-level validation
- `crossValidator.ts` — cross-document comparison
- `/api/tps/brain/merge/route.ts` — API endpoint

### Source Priority (controlling spelling):
1. DL (US document, Latin)
2. I-94 (CBP Latin)
3. EAD (USCIS Latin)  
4. Passport MRZ
5. Booklet KMU-55 transliteration
6. Brain AI guess
7. Manual input

### Hallucination Guard:
- Fuzzy name match (Levenshtein ≤ 2 = OCR error, > 2 = conflict)
- Geography dictionary (24 oblasti + cities)
- Confidence gating (Brain < 0.6 = manual)
- Label-as-value detection

## Consequences

- Wizard merge moves from client to server
- Single source of truth for normalization (translation glossary)
- Every field has audit trail: source, confidence, validation status
