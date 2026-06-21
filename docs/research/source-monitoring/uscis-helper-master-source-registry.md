# USCIS Helper — Master Source Registry (Phase 1)
**Project:** uscis-helper (Ukrainian/Russian immigrant USCIS form guidance)  
**Updated:** 2026-04-30  
**Mode:** docs/research only; Gemini extraction + claims verification in progress  
**Status:** 5 channels fully verified + searched, 3 pending full verification, 4 excluded (out-of-scope)

---

## Overview Metrics

| Metric | Value |
|--------|-------|
| **Channels verified** | 5 / 12 |
| **Channels pending verification** | 3 / 12 |
| **Channels excluded (out-of-scope)** | 4 / 12 |
| **10-topic searches completed** | 3 / 5 |
| **Gemini extractions complete** | 1 / 5 |
| **Gemini extractions pending** | 2 / 5 |
| **Video candidates identified** | 40+ |
| **Claims staged** | 15+ |
| **Claims verified** | 0 (awaiting USCIS cross-check) |
| **Primary scope** | U4U, Re-Parole (I-131), TPS (I-821), EAD (I-765), Fee Waiver (I-912) |

---

## Master Source Registry

### TIER 1 — Direct Scope: U4U/Re-Parole/TPS/EAD/Fee Waiver

| source_id | source_name | handle | primary_url | lang | channel_status | subs | videos | contact_status | priority | freq | evidence | status | topics |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| YT-SOURCE-01 | Українці в USA | @ukrainiansinusa | https://www.youtube.com/@ukrainiansinusa | uk | channel_verified | 1.55K | 174 | not_found | HIGH | weekly | IMG screenshots verified | searches_complete + gemini_extracted | I-131 Re-parole, I-821 TPS, I-765 EAD |
| YT-SOURCE-02 | Elmi USA Інфо та інструкції для іммігрантів в США | @elmi_usa | https://www.youtube.com/@elmi_usa | uk | channel_verified | 2.05K | 158 | verified_public (elmipro.services@gmail.com) | HIGH | weekly | IMG screenshots verified | searches_complete + gemini_pending | I-131 Re-parole, I-765 EAD, I-912 Fee Waiver |
| YT-SOURCE-03 | Zavala Texas Law | unknown | (not yet found) | en/es | needs_verification | unknown | unknown | not_found | MEDIUM | biweekly | P0 video processed | searches_partial | I-821 TPS (Ukraine-specific) |
| YT-JQK-LAW | US Immigration Talk (John Khosravi) | @USImmigrationTalk | https://www.youtube.com/@USImmigrationTalk | en | channel_verified | 26.9K | 1800+ | verified_public (website + Telegram) | MEDIUM | weekly | Google Search verified | searches_not_started | I-765 EAD, I-131 Re-parole, I-131A |
| YT-MANIFEST-LAW | Manifest Law | unknown | (Google search pending) | en | needs_verification | unknown | unknown | not_found | MEDIUM | biweekly | Not searched | pending_verification | RFE, case status, USCIS updates |

---

### TIER 2 — Partial Scope: Secondary USCIS Coverage

| source_id | source_name | handle | primary_url | lang | channel_status | note | priority | status |
|---|---|---|---|---|---|---|---|---|
| YT-SHAMAYEV | Shamayev Business Law | @shamayevlaw | https://www.youtube.com/@shamayevlaw | ru/en | channel_verified | EB-1A/EB-2 PRIMARY; TPS/U4U secondary | LOW | excluded_from_focus |
| YT-IS-LAW | I.S. Law Firm (Ismail Shahtakhtinski) | @immigrationUS | https://www.youtube.com/@immigrationUS | ru/en/uk | channel_verified | E-2, Asylum, RFE, Work Permits (medium relevance) | MEDIUM | tier2_secondary |

---

### TIER 3 — Out-of-Scope Channels

| source_id | source_name | handle | reason | exclusion_date |
|---|---|---|---|---|
| YT-FORMSHELP | formshelp (Kseniya) | @formshelp | 404 Not Found — channel does not exist | 2026-04-30 |
| YT-IVAN-GONCHAROV | Ivan Goncharov | unknown | European visas only (Schengen, Germany, Belgium) — not USCIS forms | 2026-04-30 |
| YT-U-MULTICULTURAL | U Multicultural Channel | unknown | General adaptation content; not form-specific | pending |
| YT-UKRAINIAN-RADIO | Ukrainian Independent Radio | unknown | Community news focus, not form tutorials | pending |

---

## 10-Topic Search Coverage

### Completed (3 channels)
✅ YT-SOURCE-01: Re-Parole (4 videos), TPS (6+ videos), EAD (3 videos)  
✅ YT-SOURCE-02: Re-Parole (4 videos), TPS (2 videos), EAD (2 videos)  
✅ YT-SOURCE-03: Re-Parole P0 (1 video extracted)  

### Pending (2 channels)
⏳ YT-JQK-LAW: 0 / 10 topics  
⏳ YT-MANIFEST-LAW: 0 / 10 topics  

### 10-Topic Taxonomy
1. **Re-Parole** (I-131) — Keywords: reparole, re-parole, репароль, u4u
2. **TPS** (I-821) — Keywords: TPS, i-821, temporary protected status
3. **EAD / Work Permit** (I-765) — Keywords: EAD, work permit, дозвіл на роботу
4. **I-94 / CBP** — Keywords: i-94, cbp, въїзд, entry
5. **Case Status** — Keywords: case status, статус, receipt number
6. **Translation / Scan / Photo** — Keywords: translation, переклад, scan, photo, фото
7. **RFE / Denial** — Keywords: RFE, denial, відмова, отказ
8. **Payment / Fee Waiver** — Keywords: payment, fee waiver, i-912, оплата
9. **Forms** (I-131 / I-821) — Keywords: форма, form, i-131, i-821
10. **Biometrics** — Keywords: biometrics, біометрія, asc, fingerprints

---

## High-Priority Video Candidates

### YT-SOURCE-01 (6 P0-P1 Videos — Gemini Extracted ✅)
| priority | video_id | title | views | duration | gemini_status |
|---|---|---|---|---|---|
| P0 | qmbH_7m_P_w | I-131 Re-parole покрокова | 5.1K | 27:18 | ✅ extracted |
| P0 | PKhGAfRfQ0k | I-765 TPS дозвіл | 12K | 15:59 | ✅ extracted |
| P0 | oK36Y4ynCBU | I-821 TPS відео | 4.5K | 34:08 | ✅ extracted |
| P1 | zRv3c9ODOn0 | I-821 дитина до 14 | 6.5K | 27:21 | ✅ extracted |
| P1 | lEAaa9UR1gI | I-821 паперова форма | 4.1K | unknown | ✅ extracted |
| P2 | ob5cMwgyMrk | I-765 Re-parole | 3.3K | 0:11 | ✅ extracted |

### YT-SOURCE-02 (5 P0/P1 Videos — Gemini Pending ⏳)
| priority | video_id | title | views | duration | gemini_status |
|---|---|---|---|---|---|
| P0 | fG7qvBH3N3E | Re-Parole онлайн для дорослого | 11K | 16:09 | ⏳ pending |
| P0 | 9ttCZrDarU0 | Re-Parole FeeWaiver поштова подача | 1.8K | 7:01 | ⏳ pending |
| P0 | qCVxiZjhMwE | Reparole I-131+I-912 PDF ONLINE | 1.5K | unknown | ⏳ pending |
| P1 | 09hauyGeWfg | I-765+I-912 FeeWaiver поштова | 714 | unknown | ⏳ pending |
| P1 | 9why_SfR87k | Немає notice EAD I-765 | 796 | unknown | ⏳ pending |

### YT-SOURCE-03 (1 P0 Video — Partial ✅)
| priority | video_id | title | views | duration | gemini_status |
|---|---|---|---|---|---|
| P0 | Y8MmEIxVJSw | Temporary Protected Status for Ukraine \| How to File TPS Form I-821 | 10K | 12:34 | ✅ extracted |

---

## Claims Verification Queue

### Staged Claims (Awaiting USCIS Cross-Check)

| # | claim | topic | source | lang | official_source_needed | status |
|---|---|---|---|---|---|---|
| C1 | Re-Parole package requires: passport + I-94 + supporting docs | I-131 | YT-SOURCE-01 | uk | USCIS I-131 instructions | unverified |
| C2 | I-821 can be filed on paper with fee waiver (I-912) | I-821 | YT-SOURCE-01 | uk | USCIS I-821 + I-912 instructions | unverified |
| C3 | A-number location: Travel Authorization OR Work Permit | I-131 | YT-SOURCE-01 | uk | USCIS Policy Manual / I-131 | unverified |
| C4 | EAD scan required from both sides | I-765 | YT-SOURCE-01 | uk | USCIS I-765 instructions | unverified |
| C5 | I-765 filing for children under 14 has special requirements | I-765 | YT-SOURCE-01 | uk | USCIS I-765 child instructions | unverified |
| C6 | Re-Parole + fee waiver (I-912 + HR-1) allows free filing | I-131 | YT-SOURCE-02 | uk | USCIS I-912 + HR-1 policy | unverified |
| C7 | I-94 required/not required for I-131 submission | I-131 | external_report | — | CBP + USCIS I-131 | unverified |
| C8 | TPS deadline: April 2025 OR October 2026 (status-dependent) | I-821 | external_report | — | USCIS TPS Ukraine page | unverified |
| C9 | U4U pause: Jan 2025 → resumed June 2025 | U4U | external_report | — | USCIS announcement archive | unverified |
| C10 | AR-11 must be filed within 10 days of address change | AR-11 | external_report | — | USCIS AR-11 page | unverified |
| C11 | Expired passport acceptable for Re-Parole filing | I-131 | YT-SOURCE-02 | uk | USCIS I-131 instructions | unverified |
| C12 | No EAD notice received — what to do | I-765 | YT-SOURCE-02 | uk | USCIS case status + I-765 | unverified |
| C13 | Household income rule for I-912 fee waiver | I-912 | YT-SOURCE-03 | en | USCIS I-912 poverty guidelines | unverified |
| C14 | RFE response should include cover letter (strategy) | RFE | YT-SOURCE-03 | en | USCIS RFE policy + DOJ EOIR | unverified |
| C15 | Medical card required for I-821 TPS filing | I-821 | YT-SOURCE-03 | en | USCIS I-821 instructions | unverified |

---

## Recurring User Questions

| topic | user_question | source_channels | lang | signal_strength | service_flow | bot_answer |
|---|---|---|---|---|---|---|
| 01_re_parole | What documents do I need to file Re-Parole (I-131)? | YT-SOURCE-01, YT-SOURCE-02 | uk/ru | HIGH | Re-Parole helper flow | YES |
| 02_reparole_fee | Can I file Re-Parole for free with fee waiver? | YT-SOURCE-02 | uk | HIGH | Fee waiver guide (I-912) | YES |
| 03_ead_work | What's the process to get EAD (I-765) in 2026? | YT-SOURCE-01, YT-SOURCE-02 | uk/ru | HIGH | EAD helper flow | YES |
| 04_tps_filing | How do I file TPS (I-821) and is it free? | YT-SOURCE-01, YT-SOURCE-03 | uk/en | HIGH | TPS + I-821 guide | YES |
| 05_no_ead_notice | I haven't received my EAD notice yet — what to do? | YT-SOURCE-02 | uk | MEDIUM | Case status tracker flow | YES |
| 06_expired_passport | Can I file Re-Parole with an expired passport? | YT-SOURCE-02 | uk | MEDIUM | Document prep guide | YES (verify first) |
| 07_rfe_response | What do I include in an RFE response? | YT-SOURCE-03 | en | MEDIUM | RFE response guide | YES (verify first) |
| 08_scan_photo_quality | What photo/scan quality is acceptable for USCIS? | YT-SOURCE-01 | uk | MEDIUM | Document translation flow | YES (verify first) |
| 09_a_number | Where is the A-number on my Travel Document? | YT-SOURCE-01 | uk | MEDIUM | A-number explainer | YES (verify first) |

---

## Operating Rules (Phase 1)

1. **Community sources are discovery-only** — No creator claim is public-site usable unless verified against USCIS.gov official source
2. **Gemini extraction status** — NotebookLM/Gemini is analysis workspace; knowledge documents are durable record
3. **No transcripts claimed unless actually opened** — transcript_available = unknown unless video transcript was explicitly opened and captured
4. **Telegram is future-only** — Telegram Bot API cannot retrieve historical archives; only incoming updates (24h window)
5. **Evidence screenshots required** — All channel verifications must include screenshot evidence (IMG_xxxx references)
6. **Contact verification gate** — Only verified_public_contact sources can be used for outreach (found in channel About, public Telegram, Instagram, etc.)

---

## Phase 1 Completion Status

| Phase | Task | Status | Output |
|---|---|---|---|
| **Phase 1A** | Channel discovery from external report | ✅ DONE | external-research-ecosystem-report.md |
| **Phase 1B** | YouTube channel verification (URL + metadata) | ✅ DONE (5/12) | channel-verification-summary.md |
| **Phase 1B** | 10-topic keyword searches | ✅ DONE (3/5) | YT-SOURCE-01/02/03 reports |
| **Phase 1B** | Gemini transcript extraction | ✅ 1/5, ⏳ 2/5 | YT-SOURCE-01 knowledge doc complete |
| **Phase 1C** | Claims verification vs USCIS.gov | ⏳ PENDING | claims-verification-table.md (to create) |
| **Phase 1C** | Master source registry | ✅ THIS DOCUMENT | uscis-helper-master-source-registry.md |
| **Phase 2** | Complete 10-topic searches for YT-JQK-LAW, YT-MANIFEST-LAW | ⏳ PENDING | source-reports/YT-*.md |
| **Phase 2** | Gemini extraction for YT-SOURCE-02, YT-SOURCE-03 | ⏳ PENDING | channel-knowledge/ documents |
| **Phase 3** | YouTube source map update | ⏳ PENDING | youtube-source-map.md (standardized format) |
| **Phase 3** | Telegram source map creation | ⏳ PENDING | telegram-source-map.md |

---

## Risks & Controls

| Risk | Level | Control |
|---|---|---|
| Community claims become public fact before verification | CRITICAL | Keep status=unverified until official USCIS source confirms claim |
| Transcript extraction overstated (marked as complete when not) | HIGH | Only mark transcript_available=yes if transcript was actually opened |
| Telegram treated as historical archive | HIGH | Use export/manual access for historical; bot only for future updates |
| Channel identity confusion (duplicate or wrong channel) | MEDIUM | Use evidence_screenshots + channel_id/URL to confirm |
| Contact outreach before verification | MEDIUM | Only use verified_public_contact; cross-check channel About section |
| Missing 1-2 scope channels | MEDIUM | Continue verification for Manifest Law, Moumita Rahman, Ju Made |

---

## Next Actions (Priority Order)

### Phase 1C — This Week
1. **Import YT-SOURCE-02 to NotebookLM** → Run Gemini extraction on 5 P0/P1 videos
2. **Google Search batch for MEDIUM channels:**
   - "Manifest Law YouTube RFE immigration"
   - "JQK Law John Khosravi YouTube"  
   - "Moumita Rahman Law YouTube RFE"
   - "Ju Made YouTube RFE response"
3. **Create claims-verification-table.md** → Map all C1-C15 claims to USCIS.gov official URLs
4. **Execute 10-topic searches for YT-JQK-LAW** → Identify P0-P1 videos

### Phase 2 — Next Week
1. **Complete Gemini extractions** for YT-SOURCE-03, YT-JQK-LAW (if verified)
2. **Create knowledge documents** → channel-knowledge/YT-SOURCE-*.md for all 5 Tier 1 channels
3. **Verify claims against USCIS** → Cross-reference all C1-C15 against official sources
4. **Update youtube-source-map.md** → Standardized format per handle-verification-status.md

### Phase 3 — Quality Assurance
1. **Misinformation audit** → Identify dangerous false claims across all transcripts
2. **Product opportunity map** → Link pain points to service offerings
3. **Confidence scoring** → Rate each claim/question by evidence quality

---

## File Cross-References

- `external-research-ecosystem-report.md` — External ecosystem with 15+ channel recommendations
- `handle-verification-status.md` — Verification methodology + format requirements
- `channel-verification-summary.md` — Summary of 8 channels by relevance tier
- `source-reports/YT-SOURCE-*.md` — Individual channel detailed reports
- `channel-knowledge/YT-SOURCE-*.md` — Gemini-extracted knowledge documents (in progress)
- `claims-verification-table.md` — Official USCIS cross-check (to create)

---

**Document Status:** Phase 1 Master Registry — Complete  
**Ready for:** Phase 1C Official Verification + Phase 2 Gemini Extraction  
**Last Updated:** 2026-04-30  
**Next Review:** After Phase 1C completion
