# USCIS Translation Standard — messenginfo

**Status:** Operational standard for translator self-certification under
8 CFR §103.2(b)(3). This is NOT legal advice and NOT a USCIS guarantee.

---

## 1. Legal Basis

8 CFR §103.2(b)(3): Any document containing foreign language submitted to
USCIS shall be accompanied by a full English language translation which
the translator has certified as complete and accurate, and by the
translator's certification that he or she is competent to translate from
the foreign language into English.

## 2. What messenginfo Provides

- **AI-assisted draft.** Mechanical translation pass against a Ukrainian
  glossary, with bbox-anchored evidence.
- **Field review surface.** User reviews and confirms each critical field.
- **Self-certification template.** A 8 CFR §103.2(b)(3) statement the
  signer fills with their own legal name and address.
- **Bureau-style PDF.** Clean, unambiguous, no source-trace metadata.
- **Manual review.** For documents we cannot self-serve, our team takes
  over manually before any payment.

## 3. What messenginfo Does NOT Provide

- Legal advice or representation.
- A "certified translation" by an agency. The signer is the certifier.
- Any guarantee of USCIS acceptance.
- Notarization. The user can take the printed PDF to a notary if their
  filing requires one — notarization verifies identity, not translation
  quality.

## 4. Required Output Elements

Per USCIS guidance (8 CFR §103.2(b)(3)):

1. Complete English translation of the foreign-language document.
2. Translator's certification statement, including:
   - Translator's full name (printed).
   - Translator's signature.
   - Translator's address.
   - Date.
   - Statement of competency in source and target languages.
   - Statement that the translation is complete and accurate to the best
     of the translator's knowledge and ability.

The statement is rendered in `certificationRecord.ts::CERTIFICATION_STATEMENT`
and signed via the `cert` screen of the wizard.

## 5. Date Format

USCIS-safe EU format: `12 May 1990` (day month year, month long).
Never `05/12/1990` (ambiguous), never `May 12, 1990` (US-only).

## 6. Name Consistency

Identity anchor priority (from `identity/packetIdentityAnchor.ts`):
international passport > I-94 > USCIS notice > EAD > manual override >
official Ukrainian transliteration.

The same `filing_name` MUST appear across every translated document in a
packet. If a Latin spelling exists from a controlling source, use it
verbatim — do NOT re-transliterate.

## 7. Numeric Accuracy

Numbers, dates, and document identifiers are evidence. They are never
inferred, "corrected by logic", copied from memory, or borrowed from
another field. See `NUMERIC_ACCURACY_PROTOCOL.md`.

## 8. Forbidden Phrases in Customer Output

See `SERVICE_CLAIMS_POLICY.md` and `translationQaValidator.ts`.
Enforced by `check-content-guards.sh` on CI.

## 9. Pages and Scope

- Scope title MUST match uploaded pages: "English Translation of the
  Provided Ukrainian Internal Passport (Booklet) Pages (pages 1-2 of 16)"
  not the broader "English Translation of Ukrainian Internal Passport".
- Original pages MUST be attached to the final package (user uploads them
  with the translation; the wizard reminds them at the `done` screen).

## 10. Refusal Surface

A translation will not be auto-generated when:

- the module status is `draft`, `manual_only`, or `disabled`
- a critical field has confidence < 0.85 and the user did not confirm it
- numeric accuracy validators failed
- payment is not confirmed
- the certification record is unsigned
- `sourceToFinalAudit` reports a missing or extra field
- the manual-review queue has an open ticket for this session
