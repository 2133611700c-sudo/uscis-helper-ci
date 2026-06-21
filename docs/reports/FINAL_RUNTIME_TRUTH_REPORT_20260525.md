STATUS: DEGRADED

LIVE SHA TRUTH
- start: 3ec6920de5312a509b1c4bfef3ad24e90acfc103
- end: 3ec6920de5312a509b1c4bfef3ad24e90acfc103
- proof: logs/phaseA_ledger_start.txt, logs/session_ledger_end.txt

DATASET MANIFEST
Doc | Filename | Hash | Notes
passport_main | /Users/sergiiivanenko/work/uscis-helper/qa-shots/private/Passport Taras Ivanenko .jpg | sha256=ec2de594c234f064cd9261a757a552bc8a26fb0d4db4d3e986dd688ff430641f | canonical
booklet_main | /Users/sergiiivanenko/work/uscis-helper/qa-shots/private/booklet_test_resized.jpg | sha256=07848f1582ed16767c6aa9b07ccf667bee58ad38075c6f3f0e7ab9905bc25dd7 | canonical
i94_main | /Users/sergiiivanenko/work/uscis-helper/qa-shots/private/I94 Taras Ivanenko .jpg | sha256=34e921bc51c351ff61f64716179cc7cc7f5639d51755cb6a9ec0a3485f371490 | canonical
ead_main | /Users/sergiiivanenko/work/uscis-helper/qa-shots/private/Ead1.jpg | sha256=99426b52d5a94a5c397b8c2484330bb955715c37d9830723802537b68af6a8f2 | canonical
dl_main | /Users/sergiiivanenko/work/uscis-helper/qa-shots/private/DL.jpg | sha256=589919ce71ed8d99ef4487967bde29355f8b7fbb5dc03ac586c515dbb64ec785 | canonical
i797_main | N/A | N/A | not used in this canonical run

SCENARIO MATRIX
Scenario | Mobile | Desktop | Owner | Slots | OCR | Review | Gate | Generate | ZIP | PDF | Verdict
initial+online+EAD yes (EN normal) | VERIFIED(step4 slots) | VERIFIED(step4 slots) | BLOCKED(OTP proof not completed) | VERIFIED | UNVERIFIED(full flow) | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | DEGRADED
initial+paper+EAD yes (EN normal) | VERIFIED(step4 slots) | VERIFIED(full E2E) | BLOCKED(OTP proof not completed) | VERIFIED | VERIFIED | VERIFIED(family only, city/province missing) | VERIFIED | VERIFIED | VERIFIED | VERIFIED | DEGRADED
rereg+paper+EAD yes (EN normal) | VERIFIED(step4 slots) | VERIFIED(step4 slots) | BLOCKED(OTP proof not completed) | VERIFIED | UNVERIFIED(full flow) | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | DEGRADED
rereg+noEAD (EN normal) | VERIFIED(step4 slots) | VERIFIED(step4 slots) | BLOCKED(OTP proof not completed) | VERIFIED | UNVERIFIED(full flow) | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | DEGRADED
initial+online+EAD yes (RU normal) | VERIFIED(step4 slots) | VERIFIED(step4 slots) | BLOCKED(OTP proof not completed) | VERIFIED | UNVERIFIED(full flow) | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | DEGRADED
initial+paper+EAD yes (RU normal) | VERIFIED(step4 slots) | VERIFIED(step4 slots) | BLOCKED(OTP proof not completed) | VERIFIED | UNVERIFIED(full flow) | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | DEGRADED
rereg+paper+EAD yes (RU normal) | VERIFIED(step4 slots) | VERIFIED(step4 slots) | BLOCKED(OTP proof not completed) | VERIFIED | UNVERIFIED(full flow) | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | DEGRADED
rereg+noEAD (RU normal) | VERIFIED(step4 slots) | VERIFIED(step4 slots) | BLOCKED(OTP proof not completed) | VERIFIED | UNVERIFIED(full flow) | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | DEGRADED

MOBILE VS DESKTOP
- Step4 slot parity for all 4 required scenarios in EN and RU: VERIFIED.
- Booklet slot presence on mobile: VERIFIED in all required normal-mode scenarios.
- Evidence: runtime-audit/phaseH_runtime_matrix_normal.json + screenshots phaseH_*_mobile_*_step4.png

OWNER VS NORMAL
- Normal mode: VERIFIED for slot matrix and one full E2E scenario (EN initial+paper+EAD yes).
- Owner mode: PARTIAL/BLOCKED.
  - /api/owner/status => {"owner":false}
  - /api/owner/request-code POST => 200 {"ok":true,...}
  - OTP verification step not completed in this run (mailbox code not consumed in-session).
- Evidence: owner/phaseH_owner_status.json, owner/phaseH_owner_sendcode_email_network.json

UPLOAD SLOT MATRIX
Mode/Branch | Passport | Booklet | I-94 | EAD | I-797 | DL | Notes
init + online + ead | yes | yes | yes | combined(i797_or_ead) | combined(i797_or_ead) | yes | slot_count=5
init + paper + ead | yes | yes | yes | combined(i797_or_ead) | combined(i797_or_ead) | yes | slot_count=5
rereg + paper + ead | yes | yes | yes | ead_old | tps_notice | yes | slot_count=6
rereg + noead | yes | yes | yes | no | tps_notice | yes | slot_count=5
owner mode | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | OTP flow not completed

FALSE READINESS / GATE AUDIT
- Gate path in full E2E (EN initial+paper+ead) reached package-ready only after required manual fields + Part7 checkbox: VERIFIED.
- Global false-readiness claim across all 8 matrix rows: UNVERIFIED (not all rows executed end-to-end).
- Evidence: e2e/phaseD_playwright_run_v2.log, e2e/step5-review.png

ZIP / PDF TRUTH
- Generated ZIP: VERIFIED (`e2e/tps-packet.zip`)
- ZIP contains: I-821.pdf, I-765.pdf, INSTRUCTION.txt (VERIFIED)
- PDF readback verified fields:
  - I-821: Ivanenko, Taras, Los Angeles, 90029, UHP, AA000000
  - I-765: Ivanenko, Taras, Los Angeles, 90029, Vinnytsia Oblast, UHP, AA000000
- Evidence: pdf/unzipped/*.txt, pdf/pdf_field_grep.txt

H.R.1 RUNTIME TRUTH
- INSTRUCTION.txt in generated ZIP: H.R.1 fee note + effective 2026-05-29 note present (VERIFIED).
- Wizard Step6 runtime UI locale check EN/RU/UK/ES: expected H.R.1 strings NOT found (FAILED).
- This is runtime drift between packet instruction output and wizard UI fee/warning surface.
- Evidence: pdf/instruction_hr1_grep.txt, runtime-audit/phaseE_hr1_locale_results.json, runtime-audit/phaseE_hr1_*.txt

DOCAI READINESS
- Processor existence/state: VERIFIED
- Live process request: VERIFIED (process_ok=true, pages=1, text_length=195)
- Current production OCR provider flag in /api/tps/health: google_vision, tps_docai_enabled=false
- Conclusion: DocAI environment is live-ready, but production path is not enabled as primary at runtime.
- Evidence: docai/phaseH_docai_summary.txt, logs/phaseF_live_health.json

TOP 10 BUGS (by severity)
1) severity: P0
   exact reproduction: Open Step6 wizard UI (EN/RU/UK/ES) with live runtime; H.R.1 fee warning text absent in body while generated INSTRUCTION includes it.
   user impact: user may miss statutory non-waivable fee and EAD validity rule in interactive UI.
   screenshot/evidence path: runtime-audit/phaseE_hr1_en.txt, runtime-audit/phaseE_hr1_locale_results.json, pdf/instruction_hr1_grep.txt
   live/network/PDF proof status: live=YES, network=N/A, pdf=YES

2) severity: P0
   exact reproduction: Run canonical booklet OCR repeatedly.
   user impact: dob never auto-filled from booklet path (NOT_FOUND), forces manual entry and can break trust.
   screenshot/evidence path: bench/canonical_5run_artifacts/results.csv
   live/network/PDF proof status: live=YES, network=YES(OCR), pdf=N/A

3) severity: P1
   exact reproduction: OCR on 270° rotated booklet sample.
   user impact: city_of_birth drift ("Prostianets settlement") can pollute review/PDF if not corrected.
   screenshot/evidence path: bench/phaseG_synthetic_multisample.csv
   live/network/PDF proof status: live=YES, network=YES(OCR), pdf=N/A

4) severity: P1
   exact reproduction: Strict JSON.parse over fresh OCR response body with raw_text containing control characters.
   user impact: downstream strict parsers can crash on valid runtime responses.
   screenshot/evidence path: audit-db/phaseC_fresh_ocr_response.json, logs in phaseC parsing step
   live/network/PDF proof status: live=YES, network=YES, pdf=N/A

5) severity: P1
   exact reproduction: Full E2E EN initial+paper+ead -> Step5 extraction flags log.
   user impact: city/province/middle may remain empty in review even when booklet uploaded.
   screenshot/evidence path: e2e/phaseD_playwright_run_v2.log, e2e/step5-review.png
   live/network/PDF proof status: live=YES, network=YES, pdf=PARTIAL(province appears in I-765)

6) severity: P1
   exact reproduction: Owner flow without in-session OTP verify.
   user impact: owner parity remains unproven; cannot certify owner-mode behavior.
   screenshot/evidence path: owner/phaseH_owner_sendcode_email_network.json
   live/network/PDF proof status: live=YES, network=YES, pdf=N/A

7) severity: P2
   exact reproduction: Compare health flags vs DocAI processor test.
   user impact: DocAI ready but disabled in production runtime flag (`tps_docai_enabled=false`).
   screenshot/evidence path: docai/phaseH_docai_summary.txt, logs/phaseF_live_health.json
   live/network/PDF proof status: live=YES, network=YES, pdf=N/A

8) severity: P2
   exact reproduction: Run matrix rows except EN initial+paper+ead full path.
   user impact: most required scenario rows still lack full OCR->review->generate->ZIP->PDF proof.
   screenshot/evidence path: runtime-audit/phaseH_runtime_matrix_normal.json
   live/network/PDF proof status: live=PARTIAL, network=PARTIAL, pdf=PARTIAL

9) severity: P2
   exact reproduction: E2E network capture file shows only one OCR response record in ocr-responses.json.
   user impact: incomplete per-slot OCR observability in evidence pipeline.
   screenshot/evidence path: e2e/ocr-responses.json
   live/network/PDF proof status: live=YES, network=PARTIAL, pdf=N/A

10) severity: P3
    exact reproduction: pdftotext emits repeated "Unknown font tag 'Helvetica'" warnings during readback.
    user impact: noisy automation logs; parsing still succeeds but can mask true errors.
    screenshot/evidence path: pdf/pdf_field_grep.txt generation logs
    live/network/PDF proof status: live=N/A, network=N/A, pdf=YES(with warnings)

WHAT IS STILL UNVERIFIED
- Full owner-mode runtime matrix (mobile+desktop, EN/RU) with OTP-complete sessions.
- Full end-to-end matrix (all 8 normal rows) including review/gate/generate/ZIP/PDF per row.
- Multi-sample benchmark with multiple real booklet identities (only one canonical identity + synthetic transforms in this run).
- Runtime evidence that Step6 wizard displays H.R.1 block correctly once complete fee panel conditions are met (currently observed missing).

