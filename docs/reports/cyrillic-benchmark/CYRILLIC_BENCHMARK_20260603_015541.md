# Cyrillic Document Benchmark — Production Pipeline — 20260603_015541
**Model:** gemini-2.5-flash (via production Core B2 pipeline)
**Decision:** `INSUFFICIENT_EVIDENCE`

## Summary
| Metric | Value |
|--------|-------|
| documents_in_corpus | 24 |
| gt_tested | 0 |
| **critical_wrong_count** | **0** |
| false_confident_count | 0 |
| hallucinated_count | 0 |
| latency_avg_ms | 1096 |
| latency_max_ms | 3148 |

## Per-Document (sanitized — no PII values)
| class | status | fields | cyr_preserved | review | lat_ms |
|-------|--------|--------|--------------|--------|--------|
| UA_BOOKLET_IDENTITY | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 1448 |
| UA_MILITARY_P1 | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 1677 |
| UA_BOOKLET_IDENTITY | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 610 |
| UA_BOOKLET_P1 | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 1498 |
| UA_BOOKLET_P2 | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 2131 |
| UA_BOOKLET_P3_SVC | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 1699 |
| UA_BOOKLET_P4_SVC | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 1432 |
| UA_BIRTH_CERT_HW | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 3148 |
| UA_BIRTH_CERT_SOVIET | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 2609 |
| UA_MARRIAGE_1939 | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 854 |
| UA_MARRIAGE_APOST | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 321 |
| UA_MARRIAGE_REPEAT | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 314 |
| UA_MARRIAGE | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 364 |
| UA_DIVORCE_BLANK | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 341 |
| UA_DIVORCE_REDACTED | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 505 |
| UA_MILITARY_P2 | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 2635 |
| UA_INTL_PASSPORT | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 667 |
| US_DL | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 839 |
| US_EAD | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 825 |
| US_I94 | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 555 |
| DEGRADED_BLUR | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 515 |
| DEGRADED_ROT15 | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 467 |
| DEGRADED_Q20 | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 344 |
| GARBAGE | API_ERROR_OR_NO_FIELDS | 0 | ? | ? | 514 |

## Notes
- Benchmark tests PRODUCTION pipeline (Translation Core B2), not raw Gemini
- Cyrillic preserved = raw_cyrillic field present in Translation output
- review_required = Core flags uncertain field for human review
- critical_wrong = critical field auto-filled with wrong value AND not flagged