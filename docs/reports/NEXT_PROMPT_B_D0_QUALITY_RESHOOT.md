# Next Prompt B — D0 Quality / Reshoot (copy-paste; DO NOT START until owner says "start D0")

**Precondition:** Gate 0 (monitoring) PASS + owner command "start D0". Until then this is a plan, not a task.

---

```
ЗАДАЧА: D0 QUALITY / RESHOOT — behind a flag, default OFF, no prod behavior change.
РОЛЬ: Execution agent under AGENT_OPERATING_CONTRACT.md. Evidence-first. Gemini-first.

КОНТЕКСТ:
- Project: /Users/sergiiivanenko/work/uscis-helper
- Live: safety wrapper (Gemini → readDocument/post-passes/arbitration → anti-fab/self-consistency gates → review/PDF).
- D0 quality signals exist in preprocess/sharp but do NOT reach readDocument. A bad photo breaks everything
  downstream — catch it before model spend.

ЦЕЛЬ:
Add a quality verdict (ACCEPT / DEGRADED_REVIEW / RESHOOT_REQUIRED) behind a flag `QUALITY_GATE_ENABLED`
(default OFF). Flag OFF = byte-identical prod. No reading is blocked in prod until the owner enables it later.

РАЗРЕШЕНО:
- new pure module e.g. lib/canonical/vision/qualityVerdict.ts computing the verdict from existing signals
  (rotation, blur, crop/document-bounds, contrast, orientation, document visibility).
- thread the verdict through the intake path BEHIND the flag; UI reshoot copy (simple, for an 80-year-old).
- reuse existing sharp/preprocess; do not add heavy new deps.

ЗАПРЕЩЕНО:
- blur (or any quality signal) used as an anti-fabrication signal — quality ≠ fabrication.
- blocking reads in prod by default; flag ON by default; changing readDocument output when flag OFF.
- model switch; second provider; HTR; OneBrain wiring; SMART; prod env/flag change; PII fixtures.

FILES (expected):
- new: lib/canonical/vision/qualityVerdict.ts (+ tests)
- preprocess/intake wiring behind QUALITY_GATE_ENABLED
- UI reshoot message component/string

TESTS (required, no PII fixtures):
- clean image → ACCEPT
- rotated image → corrected/ACCEPT (orientation handled)
- cropped/edge-cut → RESHOOT_REQUIRED
- blurred image → RESHOOT_REQUIRED
- low-contrast image → DEGRADED_REVIEW or RESHOOT_REQUIRED (define + assert)
- flag OFF → readDocument output byte-identical (snapshot)

EVIDENCE:
- tsc 0 errors; full suite green; flag-OFF byte-identical proof; sanitized verdict table (no PII).

RETURN:
RESULT: PASS/FAIL/BLOCKED/DEGRADED
task_type: d0_quality_reshoot
commit: branch:
files_changed:
tests_run / tests_passed:
flag_default_off_confirmed:
prod_byte_identical_off:
blur_not_used_as_fabrication: yes
ui_reshoot_copy_added:
confirmed_no_pii: confirmed_qa_private_not_tracked:
next_action: owner reviews; flag stays OFF; Gate 2 (ReaderResult) next.
STOP.
```

**After D0 PASS:** Gate 2 = ReaderResult interface (Prompt C), then Gate 3 = OneBrain shadow (Prompt D). No
second provider / HTR until GT from different people + owner decision (Gate 6).
