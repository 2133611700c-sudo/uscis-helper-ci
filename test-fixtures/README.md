
## Synthetic fixtures (no PII — safe for CI/smoke)
| File | doc_class | Generator |
|---|---|---|
| synthetic-passport.jpg | ua_internal_passport_booklet (TD3 MRZ) | gen_synthetic_passport.py |
| synthetic-birth-cert.jpg | ua_birth_certificate | gen_synthetic_birth_cert.py |
| synthetic-military-id.jpg | ua_military_id | gen_synthetic_military_id.py |
| synthetic-marriage-cert.jpg | ua_marriage_certificate | gen_synthetic_marriage_cert.py |
| synthetic-divorce-cert.jpg | ua_divorce_certificate | gen_synthetic_divorce_cert.py |
| synthetic-id-card.jpg | ua_id_card | gen_synthetic_id_card.py |

Run any generator with no args: `python3 test-fixtures/gen_synthetic_birth_cert.py`.
All values are hardcoded synthetic (IVANENKO TARAS etc.) — never put real data here;
real documents live ONLY in gitignored test-fixtures/real-docs/ + qa-private/.
