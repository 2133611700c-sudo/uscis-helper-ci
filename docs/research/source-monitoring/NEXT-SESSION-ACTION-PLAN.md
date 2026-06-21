# Next Session Action Plan — Gemini Extraction Phase
**Date:** 2026-04-30
**Status:** Channel Verification COMPLETE → Ready for Knowledge Extraction
**Context:** 4 newly verified channels, P0 videos identified, detailed source reports created

---

## 🚀 CRITICAL PATH FIRST (Do This Immediately)

### Step 1: Add YT-ZAVALA P0 Video to NotebookLM for Gemini Extraction

**Video Details:**
- Channel: Zavala Texas Law (@ZavalaTexasLaw)
- Title: "Temporary Protected Status for Ukraine | How to File TPS Form I-821 | Zavala Texas Law"
- Duration: 12:34 minutes
- Views: 10K
- Quality: High (professional law firm production)
- Relevance: **P0 PRIORITY** — Ukraine TPS I-821 tutorial, directly actionable

**How to find it:**
1. Go to YouTube → Search for "Zavala Texas Law Ukraine TPS I-821"
2. OR: Go to https://www.youtube.com/@ZavalaTexasLaw
3. Click on channel, search within channel for "I-821 Ukraine"
4. Click on the video (12:34 duration, 10K views)
5. Copy full URL from address bar (format: https://www.youtube.com/watch?v=VIDEO_ID)

**How to add to NotebookLM:**
1. Go to NotebookLM: https://notebooklm.google.com/notebook/555f6e28-1a29-4ea0-9b25-2d1925537145?authuser=1
2. Click "+ Додати джерела" (Add Sources)
3. Select "Вебсайти / YouTube" (Websites / YouTube)
4. Paste the full YouTube URL
5. Click "Вставити" (Insert)

**Expected output:**
- Gemini will extract video transcript
- Generate: procedure steps, document requirements, evidence checklist, fee info
- Cross-check all claims against USCIS.gov before using in knowledge base

---

### Step 2: Queue Additional P0/P1 Videos from YT-ZAVALA

**Secondary priority videos (once P0 is extracted):**

| video_title | duration | views | priority | reason |
|---|---|---|---|---|
| "USCIS Immigration Date, TPS Fees \| somebody is going to apply for VISA" | unknown | 53K | P1 | Highest views, fee reference |
| "TPS Crisis: Will Venezuelans, Haitians & Ukrainians Lose Protection in 2025?" | unknown | 1.5K | P1 | Recent, deadline discussion |

---

## 📋 Source Reports Completed This Session

| report | status | coverage | actions_documented |
|---|---|---|---|
| YT-ZAVALA-report.md | ✅ COMPLETE | 2/10 topics (TPS, I-821) | P0 video identified, claims queue drafted |
| YT-IS-LAW-report.md | ✅ COMPLETE (summary) | 0/10 (channel profile) | Need: 10-topic search + P0 identification |
| YT-SHAMAYEV | ⏳ TO START | — | Verified, need quick summary report |
| YT-IVAN-GONCHAROV | ⏳ TO START | — | Verified, need quick summary report |

---

## 📊 Channel Verification Status (Updated)

**Total channels in source map:** 30
**Verified this session:** 4 (YT-ZAVALA, YT-IS-LAW, YT-SHAMAYEV, YT-IVAN-GONCHAROV)
**Total verified:** 26/30 (87%)
**Gemini extractions pending:** 5+ videos

---

## ⚠️ Known Issues & Dependencies

| issue | impact | resolution |
|---|---|---|
| Video IDs not captured during initial search | Blocks adding to NotebookLM | Find on YouTube and copy full URL |
| 10-topic searches incomplete for YT-IS-LAW, YT-SHAMAYEV, YT-IVAN-GONCHAROV | Low priority, can defer | Parallel with Gemini extraction (not blocking) |
| Claim verification vs USCIS.gov not started | HIGH priority after Gemini | Create claims-verification-table.md |

---

## 📝 Claim Verification Queue (To Be Completed After Gemini Extraction)

**From YT-ZAVALA P0 video extraction, verify these claims:**
- [ ] TPS filing deadline for Ukraine 2025 (exact date)
- [ ] TPS filing fees: $50 per application or free with fee waiver (I-912)
- [ ] I-821 form is required for TPS application
- [ ] I-765 (EAD) processing time 30-90 days
- [ ] Expired passport: can file Re-Parole/TPS/EAD?
- [ ] Family I-912 filing: separate per person or single form?

**Verification sources:**
- USCIS.gov/TPS
- USCIS.gov/I-821
- USCIS.gov/I-765
- USCIS.gov/I-912

---

## 📚 Knowledge Documents Due (After Gemini)

| document | depends_on | estimated_effort | priority |
|---|---|---|---|
| YT-SOURCE-03-zavala-knowledge.md | Gemini extraction of P0 video | 30 min | 🔴 HIGH |
| YT-SOURCE-04-islaw-knowledge.md | 10-topic search + Gemini | 45 min | 🟡 MEDIUM |
| YT-SOURCE-05-shamayev-knowledge.md | 10-topic search + Gemini | 45 min | 🟡 MEDIUM |
| YT-SOURCE-06-goncharov-knowledge.md | 10-topic search + Gemini | 45 min | 🟡 MEDIUM |

---

## 🎯 Session Continuity Checklist

**Before starting next session, verify:**
- [ ] All 4 source reports are saved (/docs/research/source-monitoring/source-reports/)
- [ ] verification-checkpoint-final.md is updated ✅ (already done)
- [ ] youtube-source-map.md has 4 new rows with handles, URLs, subscriber counts ✅ (already done)
- [ ] NotebookLM notebook is accessible with existing sources ✅ (already done)
- [ ] YT-ZAVALA P0 video URL is identified and ready to add

---

## Time Estimate for Next Session

| phase | estimated_time | critical |
|---|---|---|
| Add YT-ZAVALA P0 to NotebookLM | 5 min | ✅ YES |
| Wait for Gemini extraction | 10-15 min | — |
| Create YT-SOURCE-03-zavala-knowledge.md | 30 min | ✅ YES |
| Complete YT-SOURCE-02 knowledge doc (from prior) | 20 min | ✅ YES |
| Quick 10-topic searches for YT-IS-LAW, YT-SHAMAYEV, YT-IVAN-GONCHAROV | 45 min | ⏳ PARALLEL |
| Claim verification vs USCIS.gov | 60+ min | ✅ AFTER extraction |

**Total for critical path:** ~90 minutes (knowledge extraction + claim verification)

---

## 📂 Key Files Ready for Next Session

- `/docs/research/source-monitoring/source-reports/YT-ZAVALA-report.md` ← P0 video info here
- `/docs/research/source-monitoring/source-reports/YT-IS-LAW-report.md`
- `/docs/research/source-monitoring/verification-checkpoint-final.md` ← Full status summary
- `/docs/research/source-monitoring/youtube-source-map.md` ← 4 new rows added
- NotebookLM: https://notebooklm.google.com/notebook/555f6e28-1a29-4ea0-9b25-2d1925537145?authuser=1

---

## 🔗 Related Context

- Prior session created: YT-SOURCE-01-knowledge.md ✅ (Gemini extracted)
- Prior session created: YT-SOURCE-02-elmi-usa-knowledge.md ✅ (Awaiting Gemini)
- Total knowledge documents pending: 6 (1 + 1 + 4 new)
- Total videos pending Gemini extraction: 5+

---

## Success Criteria for Next Session

✅ Session complete when:
1. YT-ZAVALA P0 video added to NotebookLM
2. Gemini extraction completes (1-2 sources generate)
3. YT-SOURCE-03-zavala-knowledge.md is created
4. At least 5 claims are verified against USCIS.gov

---

**Session Prepared By:** Claude (2026-04-30)
**Next Handler:** Follow this checklist to continue from Gemini extraction phase

