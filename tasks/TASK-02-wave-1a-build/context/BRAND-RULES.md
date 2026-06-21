# BRAND RULES — hard enforcement

## Public brand
**Messenginfo** — always. Never "USCIS Helper" anywhere a user can see.

The internal repo is named `uscis-helper` for legacy reasons, but no UI string, no metadata, no OG tag, no JSON-LD, no manifest, no email signature, no copy in any locale may render the words "USCIS Helper".

## Forbidden strings in rendered UI

These strings must NOT appear in:
- Any file under `apps/web/app/`
- Any file under `apps/web/components/`
- Any file under `apps/web/messages/`
- Any string in `apps/web/public/manifest.webmanifest` or generated manifest
- Any OG meta tag

Forbidden:
- `USCIS Helper`
- `AI-powered`
- `AI-assisted`
- `AI lawyer`
- `AI legal advice`
- `Certified Translation` (when describing AI output — only allowed when describing a HUMAN certified translator)
- `Coming soon` as a primary banner (small footnote OK)

## Allowed uses of "AI" in codebase (NOT violations)

- TypeScript interface names (e.g. `AIProvider`)
- Internal code comments
- Privacy policy disclosures about future AI processing
- Variable names in scripts

These won't show up in grep on `apps/web/messages/` or rendered HTML.

## Brand identity rules

**Logo**: Rounded square, indigo-600 background, white "M" letterform.
- NO eagle
- NO US flag
- NO USCIS-style seal
- NO scales of justice
- NO any government-mimicking iconography

The site must be visually distinct from any official US government site to avoid Lanham Act / FTC deception risk.

## Required disclaimers (must render visibly)

**On homepage**, in DisclaimerSection:
> Messenginfo is not a law firm and does not provide legal advice.

**On `/services/translate-document`**, the `translatePage.safeStatement` i18n key:
> USCIS generally requires a full English translation and translator certification for foreign-language documents submitted to USCIS. This page does not create a certified translation.

**In footer**, every page:
> © 2026 Messenginfo · Not a law firm · Not a translation service

## Hero copy (locked)

H1 (EN): "USCIS help for Ukrainians in the U.S."
- NOT "AI-powered USCIS help"
- NOT "Smart USCIS assistant"
- NOT "Your USCIS companion"

Subtitle (EN): "Official sources, document guidance, and clear next steps for U4U, re-parole, TPS, EAD, I-94, and case tracking."

## Trust strip (homepage)
"Official-source based · 4 languages · Not a law firm"

NOT "AI-powered · Trusted · Fast"

## Why these rules exist (so you don't second-guess them)

1. **California UPL risk** — calling anything "AI lawyer" or "AI legal advice" exposes operator to unauthorized practice of law claims under Cal. Bus. & Prof. Code §6125.
2. **Lanham Act §43(a)** — government-mimicking branding can be construed as false association.
3. **FTC AI guidance (2023-2024)** — overpromising AI capabilities ("AI-powered") triggers deceptive practices review.
4. **8 CFR 103.2(b)(3)** — USCIS rule on translator certification: only humans can certify, "AI translation" cannot meet the standard regardless of marketing.

These are not stylistic preferences. They are legal exposure boundaries.
