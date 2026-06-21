# T3PS OCR Document Matrix

| doc_type | module | field_count | required_keys_present | acceptance | note |
|---|---|---:|---|---|---|
| international_passport | passport | 8 | yes | PASS |  |
| ukrainian_internal_passport | passport | 8 | yes | PASS |  |
| i94 | i94 | 4 | yes | PASS |  |
| ead | ead | 3 | yes | PASS |  |
| uscis_notice | None | 0 | no | NOT_REQUIRED | No uscis_notice module/doc_type_hint support in current production route. |
