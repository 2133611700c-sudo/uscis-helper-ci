# Translate Document — Service Flow Inputs

Updated: 2026-04-30

## Status

Upstream intelligence from screenshot batch only.
This is not final public website copy until official verification is complete.

## Batch Signals Observed

Sources with recurring relevance:
- `@imigrant1` (scan/photo question, USCIS filing prep framing)
- `@immigrationlawyerusa` (document package lists for Re-Parole)
- `@ECUALeague` (EAD/Re-Parole filing discussions)
- `@ukrainiansinusa` and adjacent community channels (TPS/I-765 and document prep context)

Recurring user intent patterns:
- Which exact pages of passport should be uploaded?
- Scan vs photo: what quality is acceptable?
- Is translation draft enough or do I need certified translation?
- Which additional documents are needed together with translation (I-94, EAD, notices)?

## Product Rule (Locked)

- UI wording: `Translation Draft` / `AI Translation Draft` / `Draft for review`.
- Do not use: `Certified Translation` unless human translator certification is actually added.
- Every flow must show draft-only warning and user responsibility.

## Official Source Anchors Needed

1. eCFR `8 CFR 103.2(b)(3)` for translation requirement.
2. USCIS policy/instructions references where document evidence standards are stated.

## Claims From Batch That Need Verification

- "Scan or photo for USCIS" guidance specifics.
- "What pages are mandatory" by document type.
- Any creator claims implying acceptance guarantees.

## Implementation Implications For Service UX

- Keep one-step CTA: upload file/photo.
- Add pre-upload checklist with strict readability requirements.
- Add explicit `Draft only` notice before generation.
- Add official source box below upload/result panel.

## Phase 1C Pilot Evidence — YT-IMIGRANT

Source focus:
- `YT-IMIGRANT` (`@imigrant1`)
- Video signal: `Загрузка документов в USCIS онлайн: фото и сканы`

Observed user confusion signals:
- scan vs photo quality for uploads;
- what counts as “readable enough” before submission;
- confusion between draft translation output and certified translation.

Product-intelligence implications (upstream only):
- add a pre-upload quality checklist with explicit pass/fail examples;
- keep draft-only labeling at upload and result stages;
- keep official translation requirement box visible in the action panel.

Open verification queue items:
- exact USCIS upload/readability language for evidence quality;
- direct official citation mapping for scan/photo quality requirements;
- translation rule anchoring to eCFR 8 CFR 103.2(b)(3).
