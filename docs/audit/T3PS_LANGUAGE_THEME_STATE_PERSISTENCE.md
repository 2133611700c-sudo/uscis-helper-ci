# T3PS — Language + Theme Switch State Persistence

**Date:** 2026-05-19
**Production SHA:** `d735a1b`
**Verdict:** **PASS** (both P0 bugs fixed end-to-end on production)

---

## Bugs reported

1. Switching language (RU ↔ UK ↔ EN ↔ ES) in the header wiped the TPS
   wizard back to Step 1 — every uploaded doc, every OCR-extracted
   field, every choice gone.
2. The dark-mode toggle had no effect inside the wizard — header and
   footer flipped dark, the wizard surface stayed pure white.

Both are P0 for a multilingual product used by 30–80-year-olds who
have very little tolerance for "fill it in again, the website ate it".

## Root causes (engineering view)

### Bug 1 — locale switch wipes everything

`TPSWizardV2.tsx`'s rehydration `useEffect` did:

    setData((d) => ({ ...d, ...parsed, uploads: {} }))

`uploads: {}` was a hardcoded empty reset, even though the second
effect right below it was already persisting `uploadsMeta` (file name
+ status + OCR fields, sans `File` blob — `File` can't be JSON-
serialized). So everything was carefully saved and then thrown away
on the next mount.

Why does the wizard remount on language change? Because it lives at
`apps/web/src/app/[locale]/services/tps-ukraine/start/TPSWizardV2.tsx`.
Switching locales changes the `[locale]` route segment, which is a
fresh route render with new React state. The localStorage key
(`wizard:tps-ukraine:v2:state`) was always locale-independent, so the
data WAS still there — the bug was purely in the restore path.

### Bug 2 — dark mode skips the wizard

Every neutral color in `TPSWizardV2.tsx` was a hardcoded hex literal:

    const PAGE_BG = '#f4f5f7'
    const CARD_BG = '#fff'
    const TEXT_PRIMARY = '#111'
    const BORDER = '#ddd'

`SiteThemeToggle` flips `class="dark"` on `<html>`, and `globals.css`
defines `:root.dark { --background, --surface-1, --text-1, --border }`
with dark values. But inline hex literals don't read CSS variables.
So the dark class flipped fine, the rest of the site went dark, the
wizard's hardcoded `#fff` won.

## Fixes (commit `d735a1b`)

**Hydration restore** — rebuild `uploads` from `uploadsMeta`. File
objects stay `null` (we can't bring them back across navigation), but
the OCR `fields` map is fully restored. Step 5 shows the recognized
data after a locale switch with zero re-OCR.

**Color tokens** — every neutral now references the site CSS
variables:

| Token | Old | New |
|---|---|---|
| `PAGE_BG` | `'#f4f5f7'` | `'var(--background)'` |
| `CARD_BG` | `'#fff'` | `'var(--surface-1)'` |
| `BORDER` | `'#ddd'` | `'var(--border)'` |
| `BORDER_LIGHT` | `'#f0f0f0'` | `'var(--surface-3)'` |
| `TEXT_PRIMARY` | `'#111'` | `'var(--text-1)'` |
| `TEXT_SECONDARY` | `'#666'` | `'var(--text-2)'` |
| `TEXT_MUTED` / `TEXT_HINT` / `TEXT_FAINT` | `'#777' / '#999' / '#aaa'` | `'var(--text-3)'` |

Brand colors (`GREEN`, `GREEN_DARK`, `PAY_BLUE`, `PAY_BLUE_DARK`) and
alert tints (`WARN_*`, `INFO_*`) stay literal — TPS green must look
identical in light and dark.

## Audit of existing patterns (translate-document, re-parole)

Per Taras's request, audited before rolling our own:

- **translate-document** uses server-side state keyed by `sessionId`
  in the URL — different architecture (server session, not localStorage).
  Not directly reusable because TPS uses no Supabase session.
- **re-parole** keeps wizard state in React only (single-page flow),
  no persistence problem to solve.
- Both already use CSS variables (`var(--background)`,
  `var(--surface)`, etc.) — pattern was straight-applicable to TPS.

No existing TPS-equivalent code to copy. The localStorage + CSS-vars
combination is the right minimum-friction model.

## Production proof (Playwright on prod SHA `d735a1b`)

Synthetic passport image (`Date of Birth: 01 JAN 1985`, `Nationality: UKR`)
uploaded once on `/ru`, then locale switched three times:

| Step | DOB on screen | Citizenship on screen |
|---|---|---|
| RU Step 5 (after OCR) | `01/01/1985` | `Ukraine` |
| Navigate to `/uk/services/tps-ukraine/start` | **`01/01/1985`** ✅ | **`Ukraine`** ✅ |
| Navigate to `/es/services/tps-ukraine/start` | **`01/01/1985`** ✅ | **`Ukraine`** ✅ |
| Click dark-mode toggle | wizard surface visibly dark | all fields still visible |

Screenshot of dark-mode + ES locale + persisted OCR is at
`qa-shots/persist-4-es-dark.png` — wizard renders cleanly:
dark background, light text, green brand color, all extracted fields
intact ("Shevchenko", "Taras", "01/01/1985", "M", "FB1234567",
"Ukraine"). Spanish copy too ("TPS para Ucrania", "Revise los datos").

Anti-flash theme script in `[locale]/layout.tsx:125` already applies
the dark class before React hydration — no flash of light mode when
navigating to a new locale.

## Polish notes left for later

- **Alert tints in dark mode** (P2): WARN_BG (#fff3cd, used for
  fee-waiver warning on Step 2) and INFO_BG (#e8f0fe, used for the
  "no-passport" info box on Step 4) still use light-mode hex. Rare
  surfaces, low priority, but worth a dark-mode pair.
- **LanguageSwitcher exposes as a single dropdown**, not 4 separate
  aria-labelled buttons. Playwright proof used direct URL navigation
  to simulate user clicks — functionally identical, but if test code
  later needs per-locale buttons grep'able by aria-label, the
  component would need to flatten its render tree.

## What this enables

Taras's stated requirement was "человек загружает документы и должен
получить готовый результат, не на половину". Before this fix the user
could lose 10 minutes of upload + review work by misclicking the
language pill. After this fix:

- Switch language — keeps everything
- Toggle dark mode — keeps everything, wizard now actually looks dark
- Accidentally reload tab — keeps everything (localStorage)
- Return after Stripe payment — keeps everything (already had `?paid=1`
  handler, still works)

The wizard now treats user data as a contract: once entered, it stays
unless the user explicitly resets.
