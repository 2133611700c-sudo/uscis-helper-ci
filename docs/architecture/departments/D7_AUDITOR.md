# D7 — Auditor / Evidence Ledger
**Mission:** log every value (who read, which doc, which model, rejected candidates, corrections, PDF readback). One shared ledger for all products. **Forbidden:** output without auditId + per-field source.
**Tests:** central-brain auditId. **Impl:** central-brain/audit/ledger.ts (in-memory; production → Supabase). **Status:** wired into analyze; persistence + readback pending.
