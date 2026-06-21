# ADR-004: Historical Ukrainian authority and place-name preservation
Status: Accepted
Date: 2026-05-23

## Context
Old documents have historical issuers (Міліція, УМВС, ДАІ) and historical place names (Кіровоград). Auto-modernizing corrupts evidentiary fidelity.

## Decision
1. "Міліція" → "Militsiya" (not "Police", not "Militia")
2. Historical MVS/UMVS/DAI names preserved — not modernized
3. Kirovohrad in old issuers stays Kirovohrad (not Kropyvnytskyi)
4. Document text has priority over date — check what's written, not just when
5. Modern geography corrections only for current addresses, not historical documents

## Evidence
Dictionary entries with historical_mode flag. Tests for Militsiya preservation. Tests for Kirovohrad historical preservation. DMS-verified oblast English names.

## Supersedes
Any prior heuristic that auto-modernized historical issuers by date alone.
