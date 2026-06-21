# T3PS DeepSeek Brain Verification

Status model:
- Production path: Brain is feature-flagged; default path uses deterministic OCR modules.
- Fallback path: Brain can add fields only when rules are absent/weak (`module missing`, `matched=false`, or `<3` fields).

Evidence:
- Fallback trigger + merge behavior: [route.ts](/Users/sergiiivanenko/work/uscis-helper/apps/web/src/app/api/tps/ocr/extract/route.ts:229)
- Hard validators and overwrite policy: [documentBrain.ts](/Users/sergiiivanenko/work/uscis-helper/apps/web/src/lib/tps/ai/documentBrain.ts:248)
- Brain field validation gate: [documentBrain.ts](/Users/sergiiivanenko/work/uscis-helper/apps/web/src/lib/tps/ai/documentBrain.ts:328)
- OCR matrix confirms prod runs with Brain `NOT_RUN` in current contour: [T3PS_OCR_DOCUMENT_MATRIX.yaml](/Users/sergiiivanenko/work/uscis-helper/docs/audit/T3PS_OCR_DOCUMENT_MATRIX.yaml:1)
- Test suite: `pnpm --filter web test -- apps/web/src/lib/tps/ai/__tests__/documentBrain.test.ts` → PASS.

Conclusions:
- Deterministic path works without Brain (`PASS`).
- Brain path is guarded by schema + validators and cannot write directly into PDF (`PASS`).
- Review step remains mandatory for uncertain values (`PASS`).

Verdict: `PASS`
