# Form spec — TEMPLATE

Save as `docs/forms/{slug}.md`.

---

# Form {FORM_ID} — {Form name}

## Official sources

- [USCIS Form {FORM_ID}]({official_url})
- [Instructions PDF]({instructions_pdf_url})
- [Federal Register designation notice]({fr_url}) (if applicable)

## Edition

| Field | Value |
|---|---|
| Edition date | {edition_date} |
| Last verified | {edition_last_verified} |
| Source | USCIS form PDF header |

## Who may use this form

[List from instructions, paraphrased]

## Filing method

| Method | Available | Notes |
|---|---|---|
| Online (USCIS account) | yes/no | ... |
| Paper (mail) | yes/no | ... |

## Fees

| Fee | Amount | Fee waiver eligible | Effective date |
|---|---|---|---|
| Filing fee | $XXX | yes/no via I-912 | YYYY-MM-DD |
| Biometrics fee | $XX (if applicable) | ... | ... |
| HR-1 surcharge | $XXX (if applicable, post HR-1 effective date) | yes/no | ... |

## Required fields summary

Total fields: [N]
- From passport: [N]
- From I-94: [N]
- From EAD card: [N]
- From parole document: [N]
- From USCIS notice: [N]
- Manual entry: [N]
- Computed: [N]
- Not confirmed: [N]

## Detailed field list

| ID | Label | Section | Required | Source | Format |
|---|---|---|---|---|---|
| fullLegalNameFamily | Family name | Part 1, Item 1.a | yes | passport | — |
| ... | | | | | |

## Required documents

| Document | Required | Notes |
|---|---|---|
| Copy of passport biographic page | yes | ... |
| ... | | |

## Manual entry fields

These fields require the user to type information directly (not transferable from existing documents):

- Field 1
- Field 2
- ...

## Warnings

### Critical
- [Warning text] — Source: [...]

### Caution
- [Warning text] — Source: [...]

### Info
- [Warning text] — Source: [...]

## Common mistakes (from community research)

[List from `data/common-mistakes-by-form.md`]

## Verification notes

- Edition date matches USCIS PDF header: ✅/❌
- All `official_url` HEAD-checked: ✅/❌
- Fees cross-referenced against G-1055: ✅/❌
- No verbatim USCIS PDF text in this file: ✅/❌

## Cross-reference with serviceCards.ts

The Wave 1A site's `serviceCards.ts` lists this form's `officialSourceUrl` for service `{slug}`:
- Service card URL: `{from serviceCards}`
- This form's official URL: `{from this file}`
- Match: ✅/❌ — if mismatch, recommend update in Wave 1.5

---

**Last updated**: {ISO date}
**Next review due**: {ISO date + 90 days}
