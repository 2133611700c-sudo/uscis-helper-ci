# Expected routes (80 total)

## 4 locales

`en`, `ru`, `uk`, `es` — all paths prefixed.

## 8 static pages × 4 locales = 32 routes

For each locale:
- `/{locale}` (homepage)
- `/{locale}/services` (services index)
- `/{locale}/about`
- `/{locale}/contact`
- `/{locale}/faq`
- `/{locale}/privacy`
- `/{locale}/terms`
- `/{locale}/disclaimer`

## 12 service pages × 4 locales = 48 routes

For each locale, for each slug:
- `/{locale}/services/parole-expires-soon`
- `/{locale}/services/re-parole-u4u`
- `/{locale}/services/tps-ukraine`
- `/{locale}/services/ead-work-permit`
- `/{locale}/services/i-94`
- `/{locale}/services/uscis-case-status`
- `/{locale}/services/payment-problem`
- `/{locale}/services/biometrics`
- `/{locale}/services/rfe-denial`
- `/{locale}/services/translate-document`
- `/{locale}/services/form-draft-helper`
- `/{locale}/services/official-sources`

## Total

32 + 48 = **80 static routes**

## Sitemap

`apps/web/app/sitemap.ts` must emit all 80 URLs.

## hreflang

Each page metadata must include `alternates.languages` mapping to its 4 locale variants.

## Root redirect

`/` (no locale) → redirect to `/en` (default locale) — handled by next-intl middleware.

## www redirect

`https://www.messenginfo.com/*` → 301 → `https://messenginfo.com/*` — handled by `vercel.json`.
