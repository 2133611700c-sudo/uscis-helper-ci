# ADR-012: No PDF without official document structure
**Status:** Accepted (2026-05-29). **Decision:** translation PDFs render from an official form schema (`lib/translation/forms/ukraine/schemas/`, basis in `docs/official-forms/ukraine/source-ledger.json`) by `layoutSections` — not flat/by-eye. Seals = [bracketed notes]; uncertain → blank/[CONFIRM]; no "certified" claim pre-signature (8 CFR §103.2(b)(3)).
**Consequences:** a doc_type needs a documented source before a renderer; if no visual blank, TEMPLATE_BASIS=official_description_not_visual_blank.
