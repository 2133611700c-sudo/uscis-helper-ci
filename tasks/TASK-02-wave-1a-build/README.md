# TASK-02 — Wave 1A Production Site Build

**For**: Claude Code (or Cursor agent)
**Working dir**: `/Users/sergiiivanenko/work/uscis-helper`
**Duration**: 30-60 minutes
**Outcome**: messenginfo.com renders 80 routes, 4 locales, 12 service cards, mobile bar — production deploy

---

## HOW THIS FOLDER IS ORGANIZED

```
TASK-02-wave-1a-build/
├── README.md                          ← THIS FILE — read first, then run agent
├── AGENT-PROMPT.md                    ← Main prompt — paste this into Claude Code
├── context/
│   ├── PROJECT-STATE.md              ← What infra exists, what's already done
│   ├── BRAND-RULES.md                ← UI claim rules, forbidden strings
│   ├── DESIGN-TOKENS.md              ← Tailwind extend, colors, radii, shadows
│   └── SAFETY-RULES.md               ← Hard stops, no-touch folders
├── data/
│   ├── service-cards.ts.template     ← 12 ServiceCard entries ready to copy
│   ├── i18n-keys-required.json       ← Required key tree for all 4 locales
│   ├── case-status-checker-spec.md   ← Exact regex + behavior
│   └── mobile-bottom-bar-spec.md     ← Component spec
└── output-spec/
    ├── ROUTES.md                      ← All 80 expected URLs
    ├── VERIFICATION-CHECKLIST.md     ← Commands to verify success
    └── FINAL-REPORT-TEMPLATE.md      ← Format agent must use to report back
```

---

## EXECUTION

1. Open Claude Code in `/Users/sergiiivanenko/work/uscis-helper`
2. Tell Claude Code: "Read `AGENT-PROMPT.md` and execute it. All context is in this folder."
3. Wait for final report.
4. Verify deploy at https://messenginfo.com.

---

## SUCCESS CRITERIA

- 80 routes return HTTP 200 (4 locales × 20 paths)
- Brand grep returns 0 violations
- Mobile bottom bar visible on iPhone user-agent
- Case Status Checker NEVER stores or appends receipt to URL
- Build + typecheck + deploy all green
- Final report follows `output-spec/FINAL-REPORT-TEMPLATE.md`

---

## HARD STOPS (agent must STOP and report back)

- Build/typecheck failure
- Brand violation rendered on any page
- Modification to `/Users/sergiiivanenko/handy-friend-landing-v6` (read-only ref)
- Modification to `/Users/sergiiivanenko/work/messenginfo-merge` (read-only ref)
- Receipt number stored anywhere or appended to USCIS URL
- Secret committed to git
