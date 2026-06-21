# Cyrillic Document Benchmark — 20260603_013748
**Model tested:** gemini-2.5-flash
**Decision:** FAIL_FOR_PRODUCTION

## Summary
| Metric | Value |
|--------|-------|
| documents_found | 26 |
| documents_tested | 26 |
| ground_truth_available | 2 |
| ground_truth_missing | 5 |
| **critical_wrong_count** | **1** |
| false_confident_count | 1 |
| latency_avg_ms | 3417 |
| latency_max_ms | 12311 |

## Per-Document Status (no PII — class + status + latency only)
| doc_class | doc_id (sanitized) | gt | status | crit_wrong | lat_ms |
|-----------|-------------------|-----|--------|-----------|--------|
| UA_INTERNAL_PASSPORT_BOOKLET | internal_passport_[person] | ✓ | FAIL_FOR_PRODUCTION | 1 | 10290 |
| UA_INTERNAL_PASSPORT_BOOKLET | booklet_test_resized | ✗ | BLOCKED_GROUND_TRUTH_MISS | N/A | 6939 |
| UA_INTERNAL_PASSPORT_BOOKLET | booklet_page_1 | ✗ | BLOCKED_GROUND_TRUTH_MISS | N/A | 10287 |
| UA_INTERNAL_PASSPORT_BOOKLET | booklet_page_2 | ✗ | BLOCKED_GROUND_TRUTH_MISS | N/A | 9559 |
| UA_INTERNAL_PASSPORT_BOOKLET_SERVIC | booklet_page_3 | ✗ | API_ERROR | N/A | 2063 |
| UA_INTERNAL_PASSPORT_BOOKLET_SERVIC | booklet_page_4 | ✗ | BLOCKED_GROUND_TRUTH_MISS | N/A | 12311 |
| UA_BIRTH_CERT_HANDWRITTEN | birth_cert_handwritten_[person | ✗ | API_ERROR | N/A | 4113 |
| UA_BIRTH_CERT_SOVIET | birth_cert_soviet_[person] | ✗ | API_ERROR | N/A | 3970 |
| UA_MARRIAGE_CERT_1939 | marriage_1939_kharkiv_[person] | ✗ | API_ERROR | N/A | 1105 |
| UA_MARRIAGE_CERT_APOSTILLE | marriage_apostille_[person] | ✗ | BLOCKED_GROUND_TRUTH_MISS | N/A | 12021 |
| UA_MARRIAGE_CERT_REPEAT | marriage_repeat_[person]_[pers | ✗ | API_ERROR | N/A | 502 |
| UA_MARRIAGE_CERT | marriage_[person]_[person] | ✗ | API_ERROR | N/A | 657 |
| UA_DIVORCE_BLANK | divorce_blank_template | ✗ | API_ERROR | N/A | 669 |
| UA_DIVORCE_REDACTED | divorce_redacted_[person] | ✗ | API_ERROR | N/A | 634 |
| UA_MILITARY_ID_P1 | military_id_p1_[person] | ✓ | API_ERROR | N/A | 2477 |
| UA_MILITARY_ID_P2 | military_id_p2_[person] | ✗ | API_ERROR | N/A | 3305 |
| UA_INTERNATIONAL_PASSPORT | passport_international_[person | ✗ | API_ERROR | N/A | 1011 |
| US_DRIVER_LICENSE | us_driver_license | ✗ | API_ERROR | N/A | 1108 |
| US_DRIVER_LICENSE_ROT90 | us_driver_license_rotated90 | ✗ | API_ERROR | N/A | 882 |
| US_EAD | us_ead | ✗ | API_ERROR | N/A | 1245 |
| US_I94 | us_i94 | ✗ | API_ERROR | N/A | 830 |
| DEGRADED_BLUR | degraded_blur_r2 | ✗ | API_ERROR | N/A | 628 |
| DEGRADED_ROTATED15 | degraded_rot15 | ✗ | API_ERROR | N/A | 666 |
| DEGRADED_JPEG_Q20 | degraded_jpeg_q20 | ✗ | API_ERROR | N/A | 590 |
| DEGRADED_DOWNSCALE_300W | degraded_downscale_300 | ✗ | API_ERROR | N/A | 479 |
| GARBAGE_NON_DOCUMENT | garbage_non_document | ✗ | API_ERROR | N/A | 523 |

## Per-Class Summary
| class | status_values |
|-------|--------------|
| UA_INTERNAL_PASSPORT_BOOKLET | FAIL_FOR_PRODUCTION, BLOCKED_GROUND_TRUTH_MISSING |
| UA_INTERNAL_PASSPORT_BOOKLET_SERVICE | BLOCKED_GROUND_TRUTH_MISSING, API_ERROR |
| UA_BIRTH_CERT_HANDWRITTEN | API_ERROR |
| UA_BIRTH_CERT_SOVIET | API_ERROR |
| UA_MARRIAGE_CERT_1939 | API_ERROR |
| UA_MARRIAGE_CERT_APOSTILLE | BLOCKED_GROUND_TRUTH_MISSING |
| UA_MARRIAGE_CERT_REPEAT | API_ERROR |
| UA_MARRIAGE_CERT | API_ERROR |
| UA_DIVORCE_BLANK | API_ERROR |
| UA_DIVORCE_REDACTED | API_ERROR |
| UA_MILITARY_ID_P1 | API_ERROR |
| UA_MILITARY_ID_P2 | API_ERROR |
| UA_INTERNATIONAL_PASSPORT | API_ERROR |
| US_DRIVER_LICENSE | API_ERROR |
| US_DRIVER_LICENSE_ROT90 | API_ERROR |
| US_EAD | API_ERROR |
| US_I94 | API_ERROR |
| DEGRADED_BLUR | API_ERROR |
| DEGRADED_ROTATED15 | API_ERROR |
| DEGRADED_JPEG_Q20 | API_ERROR |
| DEGRADED_DOWNSCALE_300W | API_ERROR |
| GARBAGE_NON_DOCUMENT | API_ERROR |

## Decision Criteria
- PASS_FOR_PRODUCTION: critical_wrong_count=0 AND false_confident_count=0 AND ground_truth_available≥5
- PASS_FOR_OWNER_TEST_ONLY: same but ground_truth insufficient
- INSUFFICIENT_EVIDENCE: fewer than 3 docs with ground truth
- FAIL_FOR_PRODUCTION: any critical_wrong_count>0 OR false_confident_count>0

## Skipped (file not found)