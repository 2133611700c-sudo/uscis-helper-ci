# Transliteration Priority — messenginfo

**Source of truth in code:** `apps/web/src/lib/translation/identity/packetIdentityAnchor.ts`
plus `apps/web/src/lib/translation/glossary/agencyGlossary.ts`.

---

## 1. The Problem

A given Ukrainian/Russian name (Шевченко, Олександр, Тарас) has multiple
"correct" Latin spellings depending on the transliteration table:

- BGN/PCGN 1965  → SHEVCHENKO, OLEKSANDR, TARAS
- KMU 2010       → SHEVCHENKO, OLEKSANDR, TARAS
- ISO 9          → ŠEVČENKO (rare for USCIS)
- Ukrainian Postal → variants
- Russian (GOST) → SHEVCHENKO, ALEKSANDR, TARAS  (different from Ukrainian)

USCIS does NOT mandate a single transliteration system. What it requires
is **internal consistency within the packet** — the same person must spell
their name the same way across every document.

## 2. Priority Order (highest → lowest)

1. **International passport** (Ukrainian biometric or older booklet).
   The Latin spelling on the MRZ + visual zone is the **controlling
   spelling** for that person across the entire packet.
2. **I-94** (US Customs and Border Protection record).
   If the person has an I-94 with a Latin spelling, that spelling wins
   over Ukrainian transliteration tables.
3. **USCIS notice** (any prior I-797, EAD, advance parole, etc.).
   The spelling on file with USCIS wins over fresh transliteration.
4. **EAD** (Employment Authorization Document).
5. **Manual override.** User-typed controlling spelling, recorded as
   `correction_class: 'controlling_spelling'`.
6. **Official Ukrainian transliteration** (KMU 2010, latest).
   Used ONLY when no controlling Latin spelling exists, AND ONLY after
   user review.
7. **Translation memory** with classified `controlling_spelling`
   corrections from prior sessions of the same user.

## 3. What the Engine MUST NOT Do

- Transliterate silently. If no controlling spelling is set, the engine
  proposes a transliteration via Ukrainian KMU 2010 BUT marks
  `review_required=true` until the user confirms.
- Switch transliteration variants between documents in the same packet.
- Apply Russian transliteration to Ukrainian source text (or vice versa)
  unless the language_layer of that field is verifiably Russian.
- Combine transliteration tables within a single name. If `surname` is
  KMU, `given_name` MUST also be KMU.

## 4. Storage

In `PacketState`:

```ts
controlling_spelling: Record<string, string>
// Examples:
//   { 'surname': 'SHEVCHENKO',
//     'given_name': 'TARAS',
//     'patronymic': 'HRYHOROVYCH' }
```

Source of each entry is tracked via `correction_class` on the
corresponding `ExtractedField`:

- `'controlling_spelling'` — set from international passport / I-94 /
  USCIS notice / EAD / manual override
- `'ocr_error'` — local edit only, NOT stored in controlling_spelling
- `'one_document_exception'` — overrides the packet anchor for this
  single document (e.g. an old USSR document where the spelling differs
  from the modern Ukrainian passport)

## 5. Anchor Conflict Detection

`packetIdentityAnchor.ts::detectMrzVizMismatches` flags conflicts when the
MRZ Latin and the visual-zone Latin disagree. On conflict:

- `review_required=true` for all affected fields
- the wizard surfaces a clarifier card asking the user to pick the
  controlling source
- nothing else in the packet auto-renders until resolved

## 6. Example

User uploads:
- internal passport booklet with `surname` = "Шевченко"
- international passport with MRZ "SHEVCHENKO<<TARAS<HRYHOROVYCH"

Result:
- `controlling_spelling.surname` = "SHEVCHENKO" (from international
  passport)
- the booklet translation renders `Surname: SHEVCHENKO`
- if a future birth certificate is added with parent name
  "Шевченко Григорій", the engine reuses `SHEVCHENKO` for the parent
  surname automatically.
