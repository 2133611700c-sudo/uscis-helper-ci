# MESSENGINFO — Full QA Verification (Mobile + Web)

**Purpose:** Systematic end-to-end test after every major deploy.
**Scope:** All pages, all languages, all user flows, both devices.
**Time:** ~25 minutes total.

---

## PRE-FLIGHT (1 min)

```yaml
commit_expected: "___"
date: "___"
desktop_browser: "Chrome ___"
mobile_device: "iPhone/Android ___"
mobile_browser: "Safari/Chrome ___"
```

Verify deploy:
```bash
curl -s https://messenginfo.com/api/health
```
Check: `build_sha` matches commit, `status: ok`.

---

## 1. HOMEPAGE — All 3 Languages (3 min)

### Desktop
| URL | Check | Pass? |
|-----|-------|-------|
| messenginfo.com/uk | Hero loads, nav in Ukrainian, no white blocks | |
| messenginfo.com/ru | Hero loads, nav in Russian | |
| messenginfo.com/en | Hero loads, nav in English | |

### Mobile
Same 3 URLs on phone. Check:
- [ ] No Google Translate overlay appears
- [ ] No white/blank blocks
- [ ] Bottom nav bar visible (Головна/Послуги/Статус/Контакти)
- [ ] Hero image renders fully (no cut-off)
- [ ] Chat widget (blue circle) does not overlap content

---

## 2. LANGUAGE SWITCHER (3 min)

### Desktop
- [ ] Click language switcher on /uk → switches to next language
- [ ] Click again → switches to third language
- [ ] URL updates correctly (/uk → /ru → /en)
- [ ] Page content changes language (headings, buttons, nav)
- [ ] No layout jump/flash during switch
- [ ] Service cards text matches language

### Mobile
- [ ] Language switcher visible in header
- [ ] Tap works (not too small to tap)
- [ ] Same checks as desktop

---

## 3. NAVIGATION — All Pages (5 min)

### Desktop — click each, verify loads without error
| Page | URL | Loads? |
|------|-----|--------|
| Home | /en | |
| Services | /en/services (or via nav) | |
| TPS Ukraine | /en/services/tps-ukraine | |
| Re-parole | /en/services/re-parole-u4u | |
| Translate | /en/services/translate-document | |
| FAQ | /en/faq | |
| Contact | /en/contact | |
| About | /en/about | |
| Pricing | /en/pricing | |
| Privacy | /en/privacy | |
| Terms | /en/terms | |
| Disclaimer | /en/disclaimer | |

### Mobile — bottom nav bar
- [ ] "Home" → goes to homepage
- [ ] "Services" → shows service list
- [ ] "Status" → opens status check
- [ ] "Contact" → opens contact page
- [ ] Active tab highlighted correctly

---

## 4. OWNER ACCESS — Desktop (3 min)

Open: messenginfo.com/en/owner

- [ ] Page loads (no 403/404)
- [ ] Shows "Checking..." then email input
- [ ] Enter owner email → tap "Send Code"
- [ ] Screen changes to 6-digit code input
- [ ] "Code sent to your email" message visible
- [ ] Enter code from email
- [ ] Green "✓ Owner Access Active" message
- [ ] "Valid for 24 hours" text visible
- [ ] Logout button visible and works

### Verify owner status API:
```bash
# In browser console on messenginfo.com:
fetch('/api/owner/status').then(r=>r.json()).then(console.log)
# Expected: {owner: true} after login, {owner: false} after logout
```

---

## 5. OWNER ACCESS — Mobile (3 min)

Open: messenginfo.com/en/owner on phone

- [ ] Page loads on mobile browser
- [ ] Email input is full-width, easy to tap
- [ ] Keyboard opens when tapping email field
- [ ] "Send Code" button is large enough to tap
- [ ] Code input shows numeric keyboard (inputMode="numeric")
- [ ] Code digits are large and spaced
- [ ] "Verify" button works
- [ ] Green active state shows correctly
- [ ] After activation, navigate to other pages — still owner

---

## 6. TPS WIZARD FLOW (5 min)

Open: messenginfo.com/en/services/tps-ukraine/start

### Desktop
- [ ] Wizard loads, step 1 visible
- [ ] Upload slots visible: Passport, I-94, EAD, DL
- [ ] Can select filing path (Initial / Re-registration)
- [ ] Upload a test photo → OCR processes (spinner shows)
- [ ] Extracted fields appear with source badges
- [ ] Can edit extracted values
- [ ] "Generate Package" button visible
- [ ] ZIP downloads with I-821.pdf inside

### Mobile
- [ ] Wizard renders without horizontal scroll
- [ ] Upload button works (opens camera/gallery)
- [ ] Fields are readable (not cut off)
- [ ] Generate button is tappable
- [ ] ZIP download triggers (may open in browser or download)

---

## 7. TRANSLATION SERVICE (3 min)

Open: messenginfo.com/en/services/translate-document

### Desktop
- [ ] Page loads with service description
- [ ] Upload area visible
- [ ] Can upload a document image

### Mobile
- [ ] Page renders cleanly
- [ ] Upload works from camera/gallery

---

## 8. DARK / LIGHT MODE (2 min)

### Desktop
- [ ] Click sun/moon icon in header
- [ ] Background switches dark ↔ light
- [ ] Text remains readable in both modes
- [ ] No elements "disappear" (white-on-white or black-on-black)
- [ ] Service cards readable in both modes
- [ ] Owner page readable in both modes

### Mobile
- [ ] Same toggle works
- [ ] No flash of wrong theme on page load

---

## 9. RESPONSIVE LAYOUT (2 min)

### Desktop — resize browser window
- [ ] At 1200px+ → full desktop layout, cards in grid
- [ ] At 768px → tablet layout, cards stack
- [ ] At 375px → mobile layout, single column
- [ ] Header collapses correctly at each breakpoint
- [ ] Footer readable at all sizes
- [ ] No horizontal scrollbar at any size

### Mobile
- [ ] No horizontal scroll on any page
- [ ] Text doesn't overflow containers
- [ ] Images scale within bounds
- [ ] Bottom nav doesn't overlap content

---

## 10. SECURITY CHECKS (2 min)

```bash
# Bot protection: no user-agent → 403
curl -s -o /dev/null -w "%{http_code}" https://messenginfo.com
# Expected: 403

# Normal UA → 200
curl -s -o /dev/null -w "%{http_code}" -H "User-Agent: Mozilla/5.0" https://messenginfo.com
# Expected: 200 or 302

# Owner: wrong email → rejected
curl -s -X POST https://messenginfo.com/api/owner/verify-code \
  -H "Content-Type: application/json" \
  -d '{"email":"hacker@evil.com","code":"000000"}'
# Expected: {"error":"Invalid or expired code"}

# Owner: no cookie → not owner
curl -s https://messenginfo.com/api/owner/status
# Expected: {"owner":false}

# Google Translate blocked
curl -s -H "User-Agent: Mozilla/5.0" https://messenginfo.com/en | grep -o 'translate="no"'
# Expected: translate="no"

curl -s -H "User-Agent: Mozilla/5.0" https://messenginfo.com/en | grep -o 'notranslate'
# Expected: notranslate
```

---

## 11. API HEALTH (1 min)

```bash
# Health endpoint
curl -s https://messenginfo.com/api/health | python3 -m json.tool

# OCR endpoint responds (should reject without file)
curl -s -X POST https://messenginfo.com/api/tps/ocr/extract \
  -H "User-Agent: Mozilla/5.0" | head -c 100

# Generate packet responds (should reject without required fields)
curl -s -X POST https://messenginfo.com/api/tps/generate-packet \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0" \
  -d '{}' | head -c 100
```

---

## RESULT SUMMARY

```yaml
date: "___"
commit: "___"
tester: "___"

desktop:
  homepage_uk: PASS | FAIL
  homepage_ru: PASS | FAIL
  homepage_en: PASS | FAIL
  language_switch: PASS | FAIL
  navigation: PASS | FAIL
  owner_access: PASS | FAIL
  tps_wizard: PASS | FAIL
  translation: PASS | FAIL
  dark_mode: PASS | FAIL
  responsive: PASS | FAIL

mobile:
  homepage_uk: PASS | FAIL
  homepage_ru: PASS | FAIL
  homepage_en: PASS | FAIL
  language_switch: PASS | FAIL
  bottom_nav: PASS | FAIL
  owner_access: PASS | FAIL
  tps_wizard: PASS | FAIL
  google_translate_blocked: PASS | FAIL

security:
  bot_protection: PASS | FAIL
  owner_wrong_email: PASS | FAIL
  translate_no: PASS | FAIL

overall: PASS | DEGRADED | FAIL
notes: "___"
```
