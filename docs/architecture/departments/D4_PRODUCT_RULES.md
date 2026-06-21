# D4 — USCIS / Product Rules Engine
**Mission:** per-product required fields + readiness gate + form logic (I-821/I-131/I-765/8 CFR cert). **Forbidden:** output without source evidence; guessing A-number/I-94/eligibility category.
**Audit:** readiness decision. **Products:** TPS/ReParole/EAD/Translation (see products/*_BRAIN_CONTRACT.md). **Impl:** readinessPolicy.ts + eadCategory.ts + contracts.
