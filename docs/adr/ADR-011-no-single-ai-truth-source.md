# ADR-011: No single AI reader is a truth-source
**Status:** Accepted (2026-05-29). **Context:** proven live — one vision LLM fabricates handwritten Cyrillic with high confidence (Gemini→"Хроменчук Олег", GPT-4o→"Людмила Анатольевна" on the same doc).
**Decision:** every field needs ≥2 independent readers; consensus accepts only on agreement; disagreement → human. Open-set names → human-confirm even on agreement (shared-misread guard). `analyze` REJECTS a single reader.
**Consequences:** no confident fabrication reaches the user; handwriting on old docs = human-assist; printed docs auto-fill on agreement.
