# ADR-007: Signature rules for USCIS forms and translation certification
Status: Accepted
Date: 2026-05-23

## Sources
- 8 CFR 103.2(a)(2) — acceptable signature definition
- 8 CFR 103.2(a)(7)(ii)(A) — amended by 91 FR 25479 (May 11, 2026)
- Federal Register doc 2026-09289 — effective July 10, 2026
- USCIS Policy Manual Volume 1, Part B, Chapter 2
- USCIS permanent policy (July 25, 2022) on reproduced signatures

## Rules for our product

### Paper filing (by mail) — I-821, I-765:
- VALID: original handwritten signature (wet ink on paper)
- VALID: scan/photocopy/fax of original handwritten signature
- INVALID: typed name in signature field
- INVALID: DocuSign, Adobe Sign, any software-generated signature
- INVALID: signature pad / drawing on screen (not from original handwritten)
- INVALID: copy-paste signature image from another document
- CONSEQUENCE: USCIS can DENY (not just reject) AND keep filing fee ($550+)
- NO CURE: cannot fix signature on pending filing — must refile with new fee

### Online filing (myUSCIS) — I-821, I-765:
- VALID: electronic signature within myUSCIS portal only
- INVALID: everything else

### Translation certification (8 CFR §103.2(b)(3)):
- This is translator's document, not a USCIS benefit request form
- The regulation requires certification but doesn't specify signature method
- SAFEST: original handwritten signature → scan/reproduce into PDF
- Our SignaturePad component captures a handwritten mark (finger drawing)
- This is arguably a "handwritten mark" but NOT from an original paper document
- RECOMMENDATION: generate certification PDF → user prints → signs by hand → scans back
- ALTERNATIVE: use SignaturePad for convenience with disclosure that user should keep a hand-signed original

## Product implementation

### TPS wizard must show:
1. Clear warning about handwritten signature requirement (ALREADY EXISTS in 4 languages)
2. Link to USCIS source: https://www.uscis.gov/policy-manual/volume-1-part-b-chapter-2
3. Link to Federal Register rule: https://www.federalregister.gov/documents/2026/05/11/2026-09289/signatures-on-immigration-benefit-requests
4. Different guidance for paper vs online filing paths

### What our robot does:
- Fills all form fields automatically
- Leaves signature fields BLANK on printed PDFs
- Shows clear instruction: "Print → Sign by hand → Mail"
- For translation certification: offers SignaturePad with disclosure

### What our robot does NOT do:
- Does not place any signature on I-821 or I-765 forms
- Does not offer "electronic signature" for USCIS forms
- Does not imply that digital signing is sufficient for paper filing
