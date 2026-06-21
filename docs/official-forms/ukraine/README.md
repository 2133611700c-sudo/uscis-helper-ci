# Ukraine Official Forms — source-of-truth for translation templates

GOAL: bureau-style English translation PDFs based on the LEGALLY APPROVED Ukrainian
document structure for the CORRECT HISTORICAL PERIOD — not a pretty PDF from imagination.

## SOURCE RULE (updated 2026-05-29)
Assume an official form/sample/regulation/order/resolution/archived template existed for
EVERY Ukrainian state document type and EVERY period. If a source is not found on the first
pass → STATUS=SOURCE_SEARCH_INCOMPLETE (NOT "no source exists"). Keep researching across:
Verkhovna Rada (zakon.rada.gov.ua), Cabinet of Ministers, Minjust, MVS, DMS, MoD, MON,
Pension Fund / Tax Service — including historical/archived editions and appendices
(додатки/зразки/описи бланків/інструкції/порядки).

Store per doc_type: current source + historical source (for old docs) + authority + legal
act number + edition date + blank/field description + field structure + URL + access date +
confidence. A PDF renderer is allowed only when its source basis is documented; if the exact
visual blank is unavailable, the renderer uses the official field STRUCTURE and is marked
TEMPLATE_BASIS=official_description_not_visual_blank.

Status taxonomy: CURRENT_SOURCE_FOUND · HISTORICAL_SOURCE_FOUND · OFFICIAL_DESCRIPTION_FOUND
· ARCHIVE_SEARCH_NEEDED · SOURCE_SEARCH_INCOMPLETE.

Hard rules: names = KMU-55 transliteration (never translated); numbers/series/dates locked;
seals = [bracketed notes]; no "certified" claim; separate schema per certificate type;
keep current + historical editions separate (don't break 1980–2010 documents); no personal
data stored here. See source-ledger.json.
