# Competitive Research — Translation Services
> Collected: 2026-05-06 | Live browser analysis of top 10 services

---

## Top 10 Services — Full Matrix

| # | Service | Price/page | Turnaround | Languages | Key differentiator |
|---|---------|-----------|------------|-----------|-------------------|
| 1 | **RushTranslate** | $24.95 | 24h | 65+ | ATA 11yr, BBB A+, 24K reviews, USCIS guarantee |
| 2 | **RapidTranslate** | ~$24.95 | 24h | 60+ | RU/UK UI lang, order tracking, physical mail, 24/7 support |
| 3 | **ImmiTranslate** | $25 | <24h, often 1-2h | 70+ | Human-only, revisions before approval |
| 4 | **x-doc.ai** | not public | Minutes | 100+ | **AI + OCR, layout preservation, batch, context memory, 99% accuracy claim** |
| 5 | **Bluente** | ~$20 | 24h | 50+ | Ukrainian/Eastern European specialty |
| 6 | **DocTranslation.com** | $19.95 | 1-2 days | 40+ | Soviet/USSR document specialty |
| 7 | **The Spanish Group** | ~$24.95 | 24h | 90+ | Certificate immigration focus |
| 8 | **Orbit Translation** | $19.95 | 24h | 60+ | Competitive pricing |
| 9 | **TheWordPoint** | ~$24.95 | 24h | 50+ | Human translators |
| 10 | **USCIS-translations.com** | ~$20 | 24h | 30+ | USCIS-only niche |

**Our target: $9.95–$14.95 / doc (not per page) + instant (0 wait)**

---

## Technical Feature Comparison

| Feature | RushTranslate | RapidTranslate | ImmiTranslate | x-doc.ai | **US** |
|---------|:---:|:---:|:---:|:---:|:---:|
| Upload PDF/scan/JPG | ✅ | ✅ | ✅ | ✅ | ✅ |
| OCR auto-extract fields | ❌ | ❌ | ❌ | ✅ | ⭕ planned |
| Instant delivery (AI) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Human translator | ✅ | ✅ | ✅ | optional | ❌ |
| Acceptance guarantee | ✅ | ✅ | ✅ | ✅ | ⭕ messaging |
| Physical mail copy | ✅ | ✅ | ❌ | ❌ | ❌ |
| Order tracking | ❌ | ✅ | ✅ | ✅ | ❌ |
| Translation memory | ❌ | ❌ | ❌ | ✅ | ❌ |
| Batch (multiple docs) | ❌ | ❌ | ❌ | ✅ | ❌ |
| Multi-language UI | ❌ | ✅ (RU/UK) | ❌ | ❌ | ✅ (UK/RU/EN) |
| Soviet era docs | ❌ | ❌ | ❌ | ❌ | ✅ |
| Bidirectional (EN→UK) | ❌ | ❌ | ❌ | limited | ✅ |
| Price per doc (not page) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Free preview/sample | ❌ | ❌ | ❌ | ❌ | ❌ → add |
| Progress checklist | ❌ | ❌ | ❌ | ❌ | ✅ (file 3) |

**Legend: ✅ = has it | ❌ = doesn't | ⭕ = partial/planned**

---

## Key Technical Insights from x-doc.ai (AI leader)

x-doc.ai is the closest AI competitor. Their stated stack:
- **OCR**: reads scanned docs/PDFs and extracts text preserving layout
- **Context memory**: if you translate a birth cert + passport for same person, names stay consistent
- **Batch processing**: upload 5 documents at once
- **Layout preservation**: final translation mimics original document structure
- **Certification auto-generate**: creates USCIS-compliant cert statement automatically
- **SOC2 + ISO27001**: enterprise security certifications

What x-doc.ai DOESN'T do that we should:
- No Soviet-era document support
- No Ukrainian/Russian UI
- No community focus (Ukrainian, Korean, etc.)
- No bidirectional (EN→UA for people coming back to Ukraine)
- Based in Singapore — no trust signal for US users

---

## What We Must Implement (Priority Order)

### 🔴 Priority 1 — COPY FROM COMPETITORS IMMEDIATELY

**1. OCR auto-fill (x-doc.ai's killer feature)**
- User uploads photo/scan of document → AI extracts all fields → wizard pre-fills automatically
- Instead of typing "ЮРЧЕНКО ТАРАС ІВАНОВИЧ" — they just take a photo
- Implementation: use OpenAI Vision API (already have key) or Tesseract.js (free, browser)
- Document Lab already has a stub — connect it to TranslationWizard

**2. Acceptance guarantee messaging (RushTranslate/RapidTranslate)**
- "Accepted by USCIS or we fix it free" — they all have this
- We should add: "Translation prepared to USCIS format standards"
- (Cannot say "guaranteed accepted" — we don't review manually)
- Honest version: "Built on official USCIS requirements (8 CFR 103.2(b)(3))"

**3. Sample output preview (none of them have this — we can be first)**
- Show a real-looking translation output BEFORE the user starts filling forms
- "This is what your translated passport will look like"
- Builds immediate trust, removes fear of the unknown

**4. Order history / "My documents" (RapidTranslate has it)**
- localStorage: save last 3 translations with date, document type, download links
- Even without a database — just browser storage

### 🟡 Priority 2 — MEDIUM IMPACT

**5. Consistency engine (x-doc.ai's context memory)**
- When translating multiple docs for same person: detect same name appearing in different docs
- Warn user: "Your name was 'YURCHENKO' in the passport — should it be the same here?"
- Can be done purely client-side by comparing field values across sessions

**6. Multi-doc session (batch)**
- "Translate all documents for one person" workflow
- Select 3 documents at once → fill each → download all together as a ZIP
- Simple to build: run wizard 3 times, collect files, zip with JSZip

**7. Physical mail option (RushTranslate/RapidTranslate premium)**
- Premium tier: we print + mail the signed certified copy
- Needs fulfillment partner — skip for now, add later

**8. Email delivery of files (none do this well)**
- After generating 4 files: "Email them to me" button
- Use existing email route in the app

### 🟢 Priority 3 — NICE TO HAVE

**9. Translation preview in-wizard (Step 4 or 5)**
- Live preview: as user fills fields, show mini-preview of the output document
- Very impressive UX, no competitor has this

**10. USCIS compliance check**
- After all fields filled: automated check — "Required field 'Place of Birth' is empty — USCIS may reject"
- Already partially done via required field validation

---

## UX Observations from Competitors

### RushTranslate UX flow:
1. Click "Start your order"
2. Upload file (PDF, Word, scan, JPG — any device)
3. Select language pair
4. Select turnaround (24h standard, rush options)
5. Pay ($24.95/page)
6. Human translator works, delivers in 24h
7. Review + download

### RapidTranslate UX flow:
1. Upload document
2. Select from/to languages  
3. Choose certified vs standard
4. Choose turnaround
5. Add notarization option
6. Pay
7. Track order by number
8. Get email when done + download

### Our UX flow (current):
1. Select document type (Step 0)
2. Select era/country variant (Step 1)
3. Select source/target language (Step 1)
4. Fill fields manually (Steps 2-4)
5. Preview (Step 5)
6. Download 4 files (Step 6)

**Gap vs competitors:**
- We require manual field entry — they just take an uploaded file
- We have no upload/OCR
- We have no order tracking (but we're instant so less needed)
- We have BETTER: Soviet era, bidirectional, Ukrainian UI, per-doc pricing, instant

---

## Pricing Analysis

All competitors charge **per page** ($19.95–$24.95). A typical Ukrainian passport = 2 pages = $40–$50.
Birth certificate = 1 page = $19.95–$24.95.
Diploma = 2-4 pages = $40–$100.

**Our price per document (not per page):**
- Passport: $9.95 (vs $40–$50 competitor)
- Birth certificate: $9.95 (vs $19.95–$24.95)
- Diploma: $14.95 (vs $40–$100)
- Bundle (3 docs): $24.95 (vs $80–$150)

This is a 2x–10x price advantage. The messaging needs to be clear:
"Translate your Ukrainian passport for $9.95 — same USCIS format, instant download"

---

## Trust Signals We Need (Copy from Competitors)

1. ⭐ Review count + rating (need to build — currently 0 reviews)
2. 🏛️ USCIS compliance statement (have it in fine print — need it prominent)
3. 🔒 Privacy/security statement (SSL, no data sharing)
4. 📋 Acceptance rate / format standard statement
5. 💬 Examples of accepted translations (show real output — not screenshots)
6. 🌍 Language count ("10 languages supported")
7. 📄 Document count ("20 document types")
8. ✅ Checklist of what's included in each download

---

## Implementation Roadmap (from this research)

| Stage | Feature | Files | Est. effort |
|-------|---------|-------|-------------|
| **13A** | OCR upload → wizard auto-fill | `TranslationWizard.tsx` + `/api/translation/ocr` | Medium |
| **13B** | Sample output preview on landing | translation landing page | Small |
| **13C** | Multi-doc session (same person, multiple docs) | `TranslationWizard.tsx` | Medium |
| **13D** | Order history (localStorage) | new `useTranslationHistory` hook | Small |
| **13E** | Email delivery of 4 files | existing email route | Small |
| **13F** | In-wizard live preview | `TranslationWizard.tsx` Step 5 | Medium |
| **14A** | Trust signals on landing | translation landing page | Small |
| **14B** | Physical mail option | fulfillment partner needed | Large/later |

---
*Sources: rushtranslate.com, rapidtranslate.org, immitranslate.com, x-doc.ai (live, 2026-05-06)*
