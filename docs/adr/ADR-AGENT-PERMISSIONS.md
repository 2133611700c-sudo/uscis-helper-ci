# ADR-AGENT-PERMISSIONS — Roles, allowed/forbidden files, escalation

**Status:** Accepted · 2026-05-30
**Context:** Agents (virtual employees) were changing many layers at once. To keep
the document platform safe, each role has a bounded surface and a single role may
flip production switches. This complements `docs/architecture/AGENT_DOCUMENT_RULES.md`
(the hard rules) with *who may touch what*.

## Roles

| Role | May edit | MUST NOT edit | Required evidence | Stop & ask owner when |
|---|---|---|---|---|
| **SourceResearchAgent** | `docs/official-forms/**`, `source-ledger.json`, `scripts/verify-ukraine-sources.mjs` | runtime code, schemas, glossary runtime | source verifier `verified`; title+number+date match | a URL cannot be verified |
| **SchemaAgent** | `forms/ukraine/schemas/*.schema.ts`, `contract.ts` | renderers, route, glossary, flags | schema compiles; contract test green | a field has no source rule |
| **MappingAgent** | `forms/ukraine/mappings/*.mapping.ts` | schemas, renderers, route | mapping test green; never invents | recognized→canonical is ambiguous |
| **GlossaryAgent** | `packages/knowledge/src/registry/registry.csv` (+regen) | runtime route, schemas | `validateRegistry` 0 errors (source_url present) | an entry lacks an official source |
| **RendererAgent** | `pdf/renderValue.ts`, `pdf/templates/**`, `pdf.ts` | schemas, glossary, official sources, flags | golden/readback + `noSilentStrip` guard green | output would change the signed PDF |
| **OCRAgent** | `lib/engine/**` recognition | route activation, flags, schemas | live recognition evidence (no fabrication) | recognition quality is uncertain |
| **LegalGuard** | content guards, `reviewGate.ts`, `attestation.ts` | marketing copy, prices | content-guard 0; reviewGate tests green | a claim could read as legal advice |
| **QAAgent** | tests, `docs/reports/**` | production code (read-only) | reports derived from code, not by hand | a claim cannot be reproduced |
| **ReleaseManager** | `active` allowlist, `BUREAU_PDF` default, branch merges | — (coordinates only) | the Production Release Gate (G1–G12) passes | always, before flipping `active`/flag defaults |

## Hard permission rules
1. **Only ReleaseManager** may set a document `active=true` or change `BUREAU_PDF` default. No other role flips production switches.
2. **OCRAgent cannot activate** document types; **RendererAgent cannot change schemas**; **SourceResearchAgent cannot touch runtime**.
3. Every role's change ships behind CI: content-guard, tsc, full web suite, and the relevant gate test must be green.
4. A change that would alter the **signed** PDF requires owner visual approval (RendererAgent stops).
5. No role marks production-ready without **live** evidence (healthz + prod check), not green unit tests alone.
