# Verification TODO — Re-Parole U4U

**Created:** 2026-05-03  
**Branch:** stage-4-reparole-u4u-e2e-completion

---

## PARTIAL items requiring follow-up

### 1. Mia chat answers wrong I-131 edition

**What:** `/api/mia/chat` returns edition "03/22/23" instead of "02/27/26"  
**Why partial:** DeepSeek model uses training data, not serviceData.ts. System prompt in `packages/ai/` needs edition injected.  
**What to check:** `packages/ai/src/mia.ts` or wherever the system prompt is built — add:  
```
Current I-131 edition: 02/27/26 (effective April 1, 2026; USCIS accepts ONLY this edition starting April 1, 2026)
```
**Official source:** https://www.uscis.gov/forms/forms-updates  
**Expected timeline:** Fix in Stage 4.1 before any marketing

---

### 2. USCIS Forms Updates page blocked (403)

**What:** `https://www.uscis.gov/forms/forms-updates` returns 403 to automated fetchers  
**Why partial:** Cannot programmatically verify 02/27/26 edition in CI  
**What to check:** Manually visit https://www.uscis.gov/forms/forms-updates in browser and confirm I-131 line shows 02/27/26  
**Expected timeline:** Manual check before each I-131 form edition update

---

### 3. Supabase Storage 'packets' bucket

**What:** `/api/packet/generate` attempts to create 'packets' bucket, but `createBucket` may fail silently if service role lacks storage admin  
**Why partial:** Cannot verify without live Supabase credentials  
**What to check:** In Supabase dashboard → Storage → verify 'packets' bucket exists and is private  
**Expected timeline:** Before any real payment is processed

---

### 4. Email delivery end-to-end

**What:** Screen12 collects email but does not call Resend — only `setTransferEmail()` in wizard state  
**Why partial:** No email send action wired in Screen12 yet  
**What to check:** Add call to `/api/packet/email` (to be created) or extend Screen12 to POST to an email API  
**Expected timeline:** Stage 4.2

---

### 5. es locale /services/re-parole-u4u

**What:** Spanish locale production URL not tested  
**What to check:** `curl -s -o /dev/null -w "%{http_code}" https://messenginfo.com/es/services/re-parole-u4u`  
**Expected:** 200

---

### 6. I-131 PDF edition 02/27/26

**What:** Downloaded PDF shows "Edition 01/20/25" in footer (USCIS CDN may be serving stale PDF)  
**Why partial:** USCIS CDN sometimes lags behind the Forms Updates page  
**What to check:** Periodically re-download from https://www.uscis.gov/sites/default/files/document/forms/i-131.pdf and check footer  
**Note:** If PDF footer still shows 01/20/25 but Forms Updates page lists 02/27/26 → trust Forms Updates page per USCIS policy  
**Status:** "PDF version pending update" (do NOT change serviceData — 02/27/26 is correct)
