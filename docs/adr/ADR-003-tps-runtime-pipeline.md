# ADR-003: Canonical TPS runtime pipeline
Status: Accepted
Date: 2026-05-23

## Context
Earlier analysis incorrectly concluded form-fill was mostly absent (11.6%). Engineering Spec v1.1 shows 94.4% auto-fill, 1932 tests, 181 PDF readback fields. The gap is data not fully reaching TPSAnswers from all extraction modules.

## Decision
Canonical path: upload → OCR/vision → normalize via `packages/knowledge` → TPSAnswers → i765/i821 field maps → pdfPrefiller → review → export. Extend existing code, do not rebuild.

## Evidence
Field maps exist (40+ I-765 ops, 80+ I-821 mappings). PDF prefill works (181 fields, 0 mismatches). 6 OCR modules active. 1932 tests green.

## Supersedes
Any assumption that TPS pipeline is absent or needs rebuilding from scratch.
