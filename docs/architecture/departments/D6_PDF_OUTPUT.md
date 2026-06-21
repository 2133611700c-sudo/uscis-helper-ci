# D6 — PDF / Package Generator
**Mission:** official-form translation PDFs + USCIS packets + ZIP + certification + evidence map. **Forbidden:** flat/by-eye PDF; PDF if required data missing; certified claim pre-signature; decorative seal as fact.
**Audit:** PDF byte-readback. **Tests:** render(5 civil-status). **Impl:** engine/{assembler,renderPdf}.ts + translation/pdf/templates/ukraine/renderOfficialTranslation.ts (schema-driven).
