# ADR-001: Messenginfo product boundary
Status: Accepted
Date: 2026-05-23

## Context
Product can be misdescribed as legal advice, filing service, or translation-only software.

## Decision
Messenginfo is: self-help information + document translation draft + USCIS draft-form generation.
Messenginfo is NOT: law firm, legal consultation, filing agent, eligibility decision-maker.
User always reviews, signs, and files independently.

## Consequences
All UX copy preserves self-help positioning. All exports preserve user review/sign/self-file flow.
All automation stops short of legal advice or filing on behalf of user.
