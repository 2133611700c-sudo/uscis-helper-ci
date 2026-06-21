# Critical fields checklist

When extracting fields from any USCIS form, ALWAYS look for these (where applicable to the form). Map each to the correct `source_type`.

## Identity (source: passport)

- `full_legal_name` (often 3 fields: family / given / middle)
- `date_of_birth`
- `country_of_birth`
- `country_of_citizenship`
- `gender`

## Immigration data

| Field | Source type |
|---|---|
| `a_number` (Alien Registration Number) | `ead` or `uscis_notice` (note ambiguity in `notes`) |
| `uscis_online_account_number` | `uscis_notice` |
| `i94_number` | `i94` |
| `passport_number` | `passport` |
| `passport_country_of_issuance` | `passport` |
| `passport_issue_date` | `passport` |
| `passport_expiration_date` | `passport` |
| `class_of_admission` | `i94` |
| `date_of_last_arrival` | `i94` |
| `parole_expiration_date` | `parole_doc` |
| `ead_category` (e.g. c11, a12) | `ead` |
| `ead_card_number` | `ead` |
| `receipt_number` (for related cases) | `uscis_notice` |
| `ssn` | `manual_entry` (sensitivity flag in notes) |

## Physical (always manual_entry)

- `height` (feet + inches OR cm)
- `weight` (lbs OR kg)
- `eye_color`
- `hair_color`
- `ethnicity` (some forms)
- `race` (some forms)
- `marks_or_scars` (some forms)

## Address

- `current_physical_address` (street, city, state, zip, country)
- `mailing_address` (if different from physical)
- `address_history` — varies by form (5 years common for I-589)

All `manual_entry`. Address history requires careful UX; user must enter chronologically.

## Contact

- `daytime_phone`
- `mobile_phone`
- `email_address`

All `manual_entry`.

## Family

For some forms (I-589, I-130, I-485):

- `marital_status`
- `spouse_full_name` + `spouse_date_of_birth`
- `spouse_country_of_birth`
- `spouse_a_number` (if applicable)
- `children_information` — array

All `manual_entry`.

## History

For asylum (I-589), and some others:

- `immigration_history` — visa applications, denials, prior parole
- `arrests_or_convictions`
- `prior_immigration_violations`
- `country_residence_history`

All `manual_entry`. These are the most error-prone fields and need careful UI.

## Computed fields

Some fields are computed from other inputs:

- `total_time_in_us` (computed from arrival date)
- `age_at_filing` (computed from DOB)
- `eligible_for_x` (computed from category logic)

Mark `source_type: 'computed'`.

## Not confirmed

If you find a field on the form but cannot determine its source from instructions:

- Mark `source_type: 'not_confirmed'`
- Add a note explaining what's unclear
- DO NOT guess

## Format hints

Common formats to record in `format` field:

| Field | Format |
|---|---|
| Dates | `MM/DD/YYYY` or `YYYY-MM-DD` (USCIS prefers MM/DD/YYYY) |
| A-number | `A123456789` (A + 9 digits) |
| Receipt number | `IOE1234567890` (3 letters + 10 digits) |
| Passport | varies by country |
| SSN | `XXX-XX-XXXX` |
| Phone | `(XXX) XXX-XXXX` |
| ZIP | `XXXXX` or `XXXXX-XXXX` |
| Height | `feet'inches"` or `cm` |
