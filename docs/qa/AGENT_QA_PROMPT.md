# Agent Prompt: Full Site QA Verification

```yaml
task_id: MESSENGINFO_FULL_QA
priority: P0
mode: browser_test_visual_verification

mission: >
  Perform a complete visual and functional QA test of messenginfo.com
  on both desktop (Chrome) and simulated mobile viewport.
  Test all 3 languages (uk/ru/en), all navigation, owner access flow,
  TPS wizard, translation service, dark/light mode, and security.
  Take screenshots of every test. Report all issues found.

tools_required:
  - Claude in Chrome (browser automation with screenshots)
  - Desktop Commander (for curl API tests)

checklist_file: "docs/qa/FULL_QA_CHECKLIST.md"

steps:
  1_deploy_check:
    action: "curl https://messenginfo.com/api/health"
    verify: "build_sha matches expected commit"

  2_homepage_3_languages:
    action: "Navigate to /uk, /ru, /en — screenshot each"
    verify:
      - "Hero section renders with badge + info card"
      - "Navigation text matches language"
      - "No Google Translate overlay"
      - "No white/blank blocks"
      - "Bottom nav bar visible"
      - "Chat widget doesn't overlap text"

  3_language_switcher:
    action: "Click language switcher on each page"
    verify:
      - "URL changes to correct locale (/uk → /ru → /en)"
      - "All visible text changes language"
      - "No layout flash or broken elements"

  4_mobile_viewport:
    action: "Resize browser to 375x812 (iPhone viewport), test /uk, /ru, /en"
    verify:
      - "Single column layout"
      - "No horizontal scroll"
      - "Bottom nav bar visible and tappable"
      - "Text readable, not cut off"

  5_owner_access_desktop:
    action: "Navigate to /en/owner"
    verify:
      - "Page loads (not 403/404)"
      - "Email input + Send Code button visible"
      - "Enter owner email → code screen appears"
      - "6-digit input with large digits"
      - "Verify + Back buttons present"
    note: "Cannot complete login without email access — verify up to code entry"

  6_owner_access_mobile:
    action: "At 375px viewport, navigate to /en/owner"
    verify:
      - "Full-width email input"
      - "Large tappable Send Code button"
      - "Code input shows correctly"
      - "No elements cut off or overlapping"

  7_navigation_all_pages:
    action: "Visit each page, screenshot"
    pages:
      - "/en/services/tps-ukraine"
      - "/en/services/tps-ukraine/start"
      - "/en/services/re-parole-u4u"
      - "/en/services/translate-document"
      - "/en/faq"
      - "/en/contact"
      - "/en/about"
      - "/en/pricing"
    verify: "Each loads without error, content visible"

  8_dark_light_mode:
    action: "Click theme toggle, screenshot both states"
    verify:
      - "Background changes"
      - "Text readable in both modes"
      - "No invisible elements"

  9_security_api:
    action: "Run curl commands from checklist"
    verify:
      - "No UA → 403 (bot protection)"
      - "Wrong owner email → rejected"
      - "No cookie → owner:false"
      - "translate=no in HTML"
      - "notranslate in meta"

  10_tps_wizard:
    action: "Navigate to /en/services/tps-ukraine/start, screenshot"
    verify:
      - "Wizard step 1 visible"
      - "Upload slots for passport/I-94/EAD/DL"
      - "Filing path selector works"
    note: "Do NOT upload real documents in QA — verify UI only"

report_format:
  STATUS: "PASS | DEGRADED | FAIL"
  screenshots_taken: "count"
  issues_found:
    - "page: ___, issue: ___, severity: ___"
  desktop_pass: "yes/no"
  mobile_pass: "yes/no"
  security_pass: "yes/no"
  owner_access_pass: "yes/no"

hard_rules:
  - "Screenshot EVERY page tested"
  - "Test ALL 3 languages on homepage"
  - "Test at BOTH desktop and mobile viewport"
  - "Do NOT skip security checks"
  - "Do NOT upload real documents"
  - "Do NOT enter real PII in any form"
  - "Report exact URLs of any broken pages"
  - "If any page returns 4xx/5xx — FAIL that section"
```
