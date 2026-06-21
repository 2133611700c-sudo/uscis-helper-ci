# ADR-010: One Central Brain for all products
**Status:** Accepted (2026-05-29). **Context:** brain was TPS-only; Re-Parole/EAD/Translation ran separate pipelines (fragmentation, copied logic, hallucination risk).
**Decision:** a single Central Brain (`apps/web/src/lib/central-brain/`) over the shared recognition engine serves ALL products via `analyze({product,...})`. No per-product mini-brains. Departments D0–D8 are shared.
**Consequences:** unified consensus/normalization/audit; products differ only by D4 rules + D6 form. Migrate by adapter (ADR-014).
