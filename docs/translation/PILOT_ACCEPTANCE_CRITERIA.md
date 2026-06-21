# Pilot Acceptance Criteria — Messenginfo v5.0

PASS only if ALL of the following are true:

1. **No forbidden phrases** — none of SERVICE_CLAIMS_POLICY.md forbidden list appear in any output
2. **Numeric accuracy 100%** — all numeric fields in pilot fixtures match source exactly
3. **Every critical field has source trace** — field, source_zone, bbox, raw_value, normalized_value, confidence
4. **Every final PDF has certification** — CertificationRecord present, signed_at set, 8 CFR §103.2(b)(3) referenced
5. **No final download before paid state** — payment_confirmed gate enforced server-side
6. **Partial uploads use partial scope title** — "pages 1–N of M" format when uploaded < total
7. **Mobile flow works** — non-technical user (35–80 age) can complete flow on phone
8. **"CERTIFIED COPY" watermark absent** — not in PDF, HTML, or email
9. **mockOCR.ts not called in production path** — wizard calls /api/translation/extract only
10. **QA validator runs before every final render** — FAIL blocks PDF generation

## Pilot document set
- Ukrainian internal passport booklet (1994–2015 era)
- Ukrainian birth certificate (post-2003)
- Ukrainian marriage certificate (modern ДРАЦС format)

## Success metric
- 0 forbidden phrase violations
- 0 wrong numbers in pilot fixture outputs
- QA status = PASS on all pilot documents
