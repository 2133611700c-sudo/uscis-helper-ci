# S2 — Audit Persistence Hard-Fail

**Status:** DONE
**Branch:** `fix/audit-persist-hard-fail`
**Scope:** safety-only. The certification-audit write in `generate-pdf` changes from best-effort to a hard gate. No change to payment, review gate, PDF rendering, or DB schema.

---

## 1. The exact failure

`/api/translation/generate-pdf` produced the signed PDF, then *tried* to persist the order + the 8 CFR §103.2(b)(3) certification attestation, and **returned the PDF with HTTP 200 even when that persistence failed** — logging only a `DEGRADED` warning. Result: a user could receive a "signed" translation while **no audit record of the attestation existed**. The audit row is our compliance artifact; silently skipping it is a legal gap, not a logging nit.

This was already flagged as `[~]` in the master plan: *"Audit DB persistence — table created + insert works, BUT route continues on failure → S2."*

## 2. The fix

New module `apps/web/src/lib/translation/persistCertification.ts`:
- inserts `translation_orders` then `translation_certification_audit`, each with **one retry** (absorbs a transient blip / serialization error);
- supabase-js returns `{ error }` rather than throwing, and a network error *does* throw — both are caught and surfaced;
- returns `{ ok, orderErr, auditErr }`; `ok` is true **only when both rows are stored**.

Route (`generate-pdf/route.ts`) now, on `!ok`:
1. emits the **full signed attestation** as a structured `AUDIT_RECONCILE` log line (retained in Vercel logs) so a signed record is **never lost** and can be replayed into the DB;
2. **fails closed** — returns HTTP **503**, no PDF, no email, no "complete." The user already paid + signed; payment is verified by an idempotent Stripe session, so a retry does **not** re-charge (the response says so).

The order/audit rows are built from the same real columns verified in Session 68 (status=`signed` per CHECK, email=`''` per NOT NULL).

## 3. Test evidence

`apps/web/src/lib/translation/__tests__/persistCertification.test.ts` (5/5) with a fake insert client:
- both inserts succeed → `ok=true`;
- **audit insert fails both attempt + retry → `ok=false`** (the exact owner concern: no success path);
- transient audit failure recovers on retry → `ok=true`;
- thrown client/network error caught → `ok=false`;
- order insert failing also blocks success → `ok=false`.

```
persistCertification.test.ts  5 passed (5)
Full web suite                2266 passed | 4 skipped (2270)
tsc --noEmit                  0 errors
content guards                0 violations
```

## 4. Production-impact status

**Before:** any DB outage / schema drift on the audit write → user still got a 200 + "signed" PDF with no stored attestation. Live in the only signed-PDF path (`generate-pdf`).

**After:** an audit/order write failure → 503, no PDF, the signed attestation logged for reconciliation. A successful path is unchanged (still 200 + PDF + email). One retry means a transient blip no longer blocks a legitimate user.

## 5. Remaining risk (written)

- **The retry log is the durable fallback, not a queue.** On a hard outage the attestation lives in logs and must be manually/scripted-replayed; there is no automatic re-drive yet. A reconciliation job is a separate ops task (Phase 6), out of S2 scope.
- **UX trade-off (deliberate, owner-approved in the tracker as "no 200 on DB failure"):** a real outage blocks a paying, already-signed user with a "please retry" 503 rather than delivering an un-audited PDF. This fails *closed* on purpose. If the owner later prefers deliver-on-degrade, it is a one-branch change — the signed attestation is already preserved in logs either way.
- The `/api/translation/render` path (if any direct callers exist) is **not** in scope here; this PR only hardens `generate-pdf`.

## 6. Scope discipline

Changed files: new `persistCertification.ts`, new test, refactor of the persist block in `generate-pdf/route.ts` (same rows, now gated), this report, required STATUS/HANDOFF/CHANGELOG. No payment / review-gate / PDF / schema changes.
