# AGENT PROMPT — TASK-02 Wave 1A Site Build

You are Claude Code working in `/Users/sergiiivanenko/work/uscis-helper`.

Your task: build the production Messenginfo site (Wave 1A scope) per the specifications in this folder.

## STEP 0 — READ ALL CONTEXT (before writing any code)

Read these files in order:
1. `context/PROJECT-STATE.md` — what infrastructure exists, what's already deployed
2. `context/BRAND-RULES.md` — forbidden strings and brand identity rules
3. `context/DESIGN-TOKENS.md` — Tailwind theme extensions
4. `context/SAFETY-RULES.md` — hard stops and no-touch folders
5. `data/service-cards.ts.template` — exact ServiceCard data to use
6. `data/i18n-keys-required.json` — key tree all 4 locales must match
7. `data/case-status-checker-spec.md` — regex + behavior contract
8. `data/mobile-bottom-bar-spec.md` — component spec
9. `output-spec/ROUTES.md` — all 80 routes to produce
10. `output-spec/VERIFICATION-CHECKLIST.md` — commands you'll run at the end
11. `output-spec/FINAL-REPORT-TEMPLATE.md` — format your final report

## STEP 1 — VERIFY ENVIRONMENT

```bash
cd /Users/sergiiivanenko/work/uscis-helper
git status                                  # must be clean or known state
git branch --show-current                   # note current branch
pnpm install                                # ensure deps current
pnpm --filter web typecheck                 # baseline check
```

If `pnpm` not found → `corepack enable && corepack prepare pnpm@latest --activate`.

If repo state unexpected → STOP and report. Do NOT force-push or reset.

## STEP 2 — CREATE FEATURE BRANCH

```bash
git checkout -b wave-1a-build-$(date +%Y%m%d-%H%M)
```

## STEP 3 — APPLY DESIGN TOKENS

Open `apps/web/tailwind.config.ts`. Extend theme per `context/DESIGN-TOKENS.md` exactly. Do not invent additional tokens.

## STEP 4 — CREATE DATA LAYER

```bash
pnpm --filter web add lucide-react
mkdir -p apps/web/data
cp /Users/sergiiivanenko/work/uscis-helper/TASK-02-wave-1a-build/data/service-cards.ts.template apps/web/data/serviceCards.ts
```

(If the TASK-02 folder is not in the repo, copy from wherever the user dropped it.)

Then verify:
```bash
pnpm --filter web typecheck
```

## STEP 5 — UPDATE i18n ROUTING

Edit `apps/web/i18n/routing.ts`:
- `locales: ['en', 'ru', 'uk', 'es'] as const`
- `defaultLocale: 'en'`
- `localePrefix: 'always'`

Update middleware accordingly.

## STEP 6 — POPULATE i18n MESSAGE FILES

Create/update all 4 files with identical key structure (per `data/i18n-keys-required.json`):
- `apps/web/messages/en.json`
- `apps/web/messages/ru.json`
- `apps/web/messages/uk.json`
- `apps/web/messages/es.json`

Tone:
- EN: professional US English
- RU: formal "вы", immigration terminology
- UK: formal "ви", Ukrainian immigration terminology
- ES: formal "usted", Latin American Spanish

After writing all 4, verify key parity:
```bash
jq -r 'paths(scalars) | join(".")' apps/web/messages/en.json | sort > /tmp/en.keys
for loc in ru uk es; do
  jq -r 'paths(scalars) | join(".")' apps/web/messages/$loc.json | sort > /tmp/$loc.keys
  diff /tmp/en.keys /tmp/$loc.keys
done
```

Diff output must be empty for all 3.

## STEP 7 — BUILD COMPONENTS

Create components in `apps/web/components/`:

**Layout:**
- `layout/Header.tsx` (sticky, logo + nav + locale switcher + Check Status CTA)
- `layout/Footer.tsx` (4-column)
- `layout/MobileBottomBar.tsx` (per `data/mobile-bottom-bar-spec.md`)
- `layout/MiaWidget.tsx` (floating bottom-right, NOT chat, NOT AI)

**Home sections (in order):**
- `home/TrendingTopicsBar.tsx`
- `home/Hero.tsx` (with embedded CaseStatusChecker)
- `home/CaseStatusChecker.tsx` (per `data/case-status-checker-spec.md` — CRITICAL)
- `home/OfficialSourcesStrip.tsx`
- `home/ServiceCardsGrid.tsx`
- `home/AskQuestionCTA.tsx`
- `home/HowWeHelp.tsx` (3 columns, NO "AI" word)
- `home/DocumentTranslationPreview.tsx`
- `home/TelegramStrip.tsx` (env-aware: reads NEXT_PUBLIC_TELEGRAM_CHANNEL_URL etc.)
- `home/DisclaimerSection.tsx`

**Service page:**
- `service/ServiceHero.tsx`
- `service/RiskBadge.tsx`
- `service/SourceBadge.tsx`
- `service/RelatedServices.tsx`

**Brand:**
- `brand/Logo.tsx` (rounded square, indigo-600 bg, white "M" — NO eagle, NO seal)

## STEP 8 — BUILD ROUTES

`apps/web/app/[locale]/page.tsx` — Homepage composing all home sections.

`apps/web/app/[locale]/services/[slug]/page.tsx`:
- `generateStaticParams` returns 12 slugs × 4 locales = 48 paths
- Reads i18n keys `servicePages.{slug}` for content
- Renders ServiceHero + What This Helps With + Common Mistakes + Official Source Callout + RelatedServices + Disclaimer
- Special: if `slug === 'translate-document'` → ALSO render `translatePage.safeStatement` visibly
- Special: if `slug === 'uscis-case-status'` → ALSO embed CaseStatusChecker

Other static pages: `/[locale]/privacy`, `/[locale]/terms`, `/[locale]/disclaimer`, `/[locale]/about`, `/[locale]/contact`, `/[locale]/faq`, `/[locale]/services` (index).

Total: 20 paths per locale × 4 locales = 80 static URLs.

## STEP 9 — BRAND ASSETS

```bash
pnpm --filter web add -D sharp
mkdir -p apps/web/scripts apps/web/public/icons apps/web/public/og
```

Create `apps/web/scripts/generate-icons.mjs`:
- Reads `apps/web/public/icon.svg` (Logo component output rasterized)
- Outputs: favicon.ico, apple-touch-icon.png (180×180), icons/icon-192.png, icons/icon-512.png
- Generates og/messenginfo-og.png (1200×630) with brand background + "Messenginfo — USCIS help"

Add to `apps/web/package.json` scripts:
```json
"generate-icons": "node scripts/generate-icons.mjs"
```

Run: `pnpm --filter web generate-icons`

Create `apps/web/app/manifest.ts`:
```typescript
export default function manifest() {
  return {
    name: 'Messenginfo',
    short_name: 'Messenginfo',
    description: 'USCIS help for Ukrainians in the U.S.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4f46e5',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
```

## STEP 10 — vercel.json + SEO

Create `apps/web/vercel.json` per `context/PROJECT-STATE.md` section "vercel.json".

Create:
- `apps/web/app/sitemap.ts` (80 URLs)
- `apps/web/app/robots.ts` (Allow / except /api/)
- hreflang via `metadata.alternates.languages` in each page's `generateMetadata`
- JSON-LD: Organization schema on homepage, Service schema on each service page

## STEP 11 — LOCAL VERIFICATION

```bash
pnpm --filter web typecheck    # MUST pass
pnpm --filter web lint         # MUST pass
pnpm --filter web build        # MUST succeed

# Brand safety greps (HARD STOP if any non-empty)
grep -RE "USCIS Helper" apps/web/app apps/web/components apps/web/messages
grep -RE "AI-powered|AI-assisted|AI lawyer|AI legal advice" apps/web/app apps/web/components apps/web/messages
grep -RE "Certified Translation" apps/web/messages
```

Each grep must return empty. If any returns matches → fix before commit.

## STEP 12 — COMMIT + PUSH + DEPLOY

```bash
git add .
git status                                  # review what's staged
git commit -m "feat(wave-1a): production site with 12 services, 4 locales, mobile bar"
git push -u origin HEAD
```

Vercel auto-deploys on push to GitHub. Wait for deploy:
```bash
# Use Vercel CLI if available
vercel --version 2>/dev/null && vercel ls --token=$VERCEL_TOKEN | head -5
# Otherwise check via curl
sleep 90
curl -sI https://messenginfo.com/en | head -3
```

## STEP 13 — PRODUCTION VERIFICATION

Run all checks from `output-spec/VERIFICATION-CHECKLIST.md`. Save outputs to `/tmp/wave-1a-verification.txt`.

## STEP 14 — FINAL REPORT

Write final report to `/tmp/wave-1a-final-report.md` following `output-spec/FINAL-REPORT-TEMPLATE.md` exactly. Include:
- All 17 sections from template
- Verification command outputs
- Pending items for Wave 1.5

Then output the report path. Do not narrate the work — just point to the report.

## CONSTRAINTS THROUGHOUT

- Do NOT modify `/Users/sergiiivanenko/handy-friend-landing-v6` (read-only reference)
- Do NOT modify `/Users/sergiiivanenko/work/messenginfo-merge` (read-only reference)
- Do NOT copy components verbatim from those folders — read them for inspiration only
- Do NOT add USCIS Helper, AI-powered, AI-assisted, AI lawyer, AI legal advice strings to UI
- Do NOT use Certified Translation in any user-facing copy
- Do NOT store receipt numbers anywhere
- Do NOT append receipt to USCIS URL
- Do NOT commit secrets

## EXECUTE NOW.
