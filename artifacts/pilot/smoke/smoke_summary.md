# Pilot Smoke Check — Summary

**Date:** 2026-05-09  
**Session:** a9afd327-a44e-49e2-b4a9-1aa53bc37182 (synthetic fixture)  
**Live OCR session:** 92567d4f-e950-417c-88d7-271615eb9714  
**PDF:** artifacts/e2e/smoke_test_output.pdf (3162 bytes, 2 pages)

## Steps

| Step | Result |
|---|---|
| Session created | ✅ HTTP 201 |
| 11 fields seeded (synthetic, not real PII) | ✅ |
| 8 critical fields confirmed | ✅ |
| Correction applied (issued_by) | ✅ |
| can_certify gate | ✅ true |
| Certify endpoint | ✅ HTTP 200, v1.0-8cfr-2026 |
| Payment mock (no real charge) | ✅ payment_confirmed=true |
| Render endpoint | ✅ HTTP 200, application/pdf, 3162 bytes |
| PDF magic bytes valid | ✅ starts with %PDF |
| final_renders DB row | ✅ present |
| Audit log PII check (11 events) | ✅ 0 violations |
| All 11 critical fields in live OCR session | ✅ |

## PDF Forbidden Scan

- Pages: 2
- Forbidden phrases checked: 19
- Violations: **0**
- Verdict: **PASS**

## Overall Verdict: ✅ PASS
