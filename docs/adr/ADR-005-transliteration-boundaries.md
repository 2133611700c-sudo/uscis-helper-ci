# ADR-005: Transliteration engine boundaries
Status: Accepted
Date: 2026-05-23

## Context
Three transliteration implementations exist:
1. `packages/knowledge/src/transliterate.ts` — canonical KMU-55 for Ukrainian
2. `apps/web/src/lib/tps/transliterate.ts` — TPS WinAnsi wrapper, delegates to own KMU-55 (fixed with ЗГ→Zgh)
3. `apps/web/src/lib/translation/generateTranslationHTML.ts` — translation renderer, handles BOTH Ukrainian (KMU) AND Russian (GOST 7.79-2000)

## Decision
- `@uscis-helper/knowledge` is canonical for **Ukrainian** transliteration (KMU-55)
- `generateTranslationHTML.ts` keeps its GOST table for **Russian** transliteration of Soviet-era documents
- `nominativeCaseRestorer.ts` delegates Ukrainian transliteration to knowledge (DONE)
- `tps/transliterate.ts` has its own KMU implementation with WinAnsi safety layer (fixed, compatible)

## Future migration path
When/if Russian document support is added to the knowledge package, `generateTranslationHTML.ts` should delegate its Ukrainian path to `transliterateKMU55` and keep only GOST for Russian. This is tracked, not urgent.

## Consequences
- Ukrainian transliteration is canonical in knowledge for all new code
- Russian transliteration stays local to translation module
- No silent divergence — both KMU implementations produce the same output (ЗГ→Zgh fix applied to both)
