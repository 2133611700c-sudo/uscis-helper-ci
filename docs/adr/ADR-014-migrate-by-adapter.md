# ADR-014: Migrate products by adapter; never break TPS
**Status:** Accepted (2026-05-29). **Decision:** un-migrated products return `delegated_to_legacy` (existing flow untouched). Migration order: Translation → Re-Parole (intake-only first) → EAD → TPS LAST (behavior-preserving). Re-Parole/EAD generation stays on legacy generate-packet until explicitly migrated.
