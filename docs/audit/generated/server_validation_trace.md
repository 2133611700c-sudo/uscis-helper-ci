# Server Validation Trace

- Route: `apps/web/src/app/api/tps/generate-packet/route.ts`
- Minimal validator: `isMinimallyComplete()` in `apps/web/src/lib/tps/answers.ts`

## Verified checks
- Server returns `422` with `missing[]` when minimal fields absent (route.ts lines with `status: 422`).
- `marital_status` required server-side (`answers.ts`: `if (!a.marital_status) missing.push('marital_status')`).
- `part7_reviewed` required server-side (`answers.ts`: `if (!a.part7_reviewed) missing.push('part7_reviewed')`).
- `ead_category` required when `wants_ead=true`.
- Packet checker UI and config align on critical field list (`config.ts` + `PacketCompletenessChecker.tsx`).

## Risk notes
- Client-side selector stability in browser automation is weak (from T3PS-02), so UX flow can fail before reaching server validation proof in one run.
- Server-side hard stop exists and is explicit via 422 JSON; no silent server pass observed for missing critical fields.
