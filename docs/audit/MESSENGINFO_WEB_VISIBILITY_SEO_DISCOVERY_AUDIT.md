# Messenginfo Web Visibility / SEO Discovery Audit

Generated at: 2026-05-21T05:21:53Z

Status: PARTIAL

Reason: production pages, robots, sitemap, browser rendering, and web search samples were verified. Direct Google SERP screenshots through Playwright were blocked by Google's unusual-traffic page, so Google ranking screenshots are PARTIAL; web-search samples still show brand/indexing evidence.

## Executive Summary

Messenginfo is visible for exact brand and `site:messenginfo.com` style discovery, but it is not currently competitive for non-brand user-intent searches such as Ukraine TPS, U4U re-parole, I-94 issues, and USCIS translation queries.

The top technical issue is that the sitemap includes `/services/tps-ukraine`, but the live URL redirects to `/services/tps-ukraine/start`, and the `/start` wizard is `noindex, nofollow`. That means the sitemap points crawlers at a URL that does not remain an indexable TPS landing page.

The second serious issue is stale search identity: web search currently shows an old `www.messenginfo.com` result with `$1 checks | Messenginfo` content, while the current site is USCIS-help oriented. This creates brand confusion and weak trust.

The first fix should be to restore an indexable TPS landing/info page at `/[locale]/services/tps-ukraine` and link the transactional wizard from that page, instead of redirecting the indexable route to the noindex wizard.

## Evidence Index

- Browser snapshot: `docs/reports/evidence/messenginfo-web-visibility/browser_visibility_snapshot.json`
- Page screenshots: `docs/reports/evidence/messenginfo-web-visibility/screenshots/`
- HTTP headers: `docs/reports/evidence/messenginfo-web-visibility/http_headers.txt`
- Robots snapshot: `docs/reports/evidence/messenginfo-web-visibility/robots.txt`
- Sitemap snapshot: `docs/reports/evidence/messenginfo-web-visibility/sitemap.xml`
- Sitemap analysis: `docs/reports/evidence/messenginfo-web-visibility/sitemap_analysis.json`
- Repo checks: `docs/reports/evidence/messenginfo-web-visibility/repo_visibility_checks.txt`
- Basic performance: `docs/reports/evidence/messenginfo-web-visibility/basic_perf.txt`

## Visibility Status

| Check | Status | Evidence |
| --- | --- | --- |
| Domain browser accessibility | VERIFIED | `/`, `/ru`, TPS start, translate page rendered in Playwright |
| Raw curl without browser UA | FAILED/NON-BLOCKING | Cloudflare returned 403 without browser-like UA in `basic_perf` first pass |
| Browser-like HTTP access | VERIFIED | 307/200 responses in `http_headers.txt` and `basic_perf.txt` |
| `www` canonical host | VERIFIED | `https://www.messenginfo.com/` redirects to apex, then `/en` |
| robots.txt | PASS | Allows `User-agent: *`, disallows `/api/`, sitemap declared |
| sitemap.xml | PASS_WITH_ISSUE | 92 URLs present; includes TPS landing URLs that redirect to noindex wizard |
| noindex | PASS_WITH_ISSUE | Transactional `/start` is noindex, which is correct, but sitemap landing redirects into it |
| canonical/hreflang | PASS_WITH_ISSUE | Home and translate have canonical/hreflang; TPS start has no hreflang and is noindex |
| structured data | PASS | Home has 2 JSON-LD blocks, translate has 3, TPS start has 2 |
| Google brand screenshot | BLOCKED | Playwright received Google's unusual-traffic page |
| Web search brand result | VERIFIED | Search sample finds Messenginfo, but stale `www` result appears |
| Non-brand intent visibility | WEAK | Search samples for TPS/re-parole/I-94/translation queries did not surface Messenginfo in returned top results |

## Production Page Findings

| URL | HTTP/browser result | Title | Robots | Canonical | Notes |
| --- | --- | --- | --- | --- | --- |
| `https://messenginfo.com/` | 307 to `/en`, rendered final `/en` | `Messenginfo - USCIS Help for Ukrainians in the U.S.` | `index, follow` | `/en` | OK |
| `https://messenginfo.com/ru` | 200 | `Messenginfo - Pomoshch s USCIS dlya ukraintsev v SShA` | `index, follow` | `/ru` | OK |
| `https://messenginfo.com/ru/services/tps-ukraine` | 307 to `/start`, rendered final `/start` | `TPS Ukraina - podgotovka paketa | Messenginfo` | `noindex, nofollow` | `/start` | Critical SEO issue |
| `https://messenginfo.com/ru/services/tps-ukraine/start` | 200 | `TPS Ukraina - podgotovka paketa | Messenginfo` | `noindex, nofollow` | `/start` | Correct for wizard, wrong as final sitemap target |
| `https://messenginfo.com/ru/services/translate-document` | 200 | `Perevod dokumentov | Messenginfo` | `index, follow` | `/ru/services/translate-document` | OK |

## Ranked Root Causes

1. Critical: TPS landing route redirects to a noindex wizard.
   Evidence: `apps/web/src/app/[locale]/services/tps-ukraine/page.tsx:17-20`, `apps/web/src/app/[locale]/services/tps-ukraine/start/page.tsx:48-52`, production browser snapshot.
   Fix: make `/[locale]/services/tps-ukraine` an indexable content landing page with crawlable text, official-source links, FAQ, internal links, and a CTA to `/start`.
   Effort: medium.
   Expected impact: high for TPS queries.

2. High: stale `www.messenginfo.com` search result shows old `$1 checks` business-check content.
   Evidence: web search sample for `messenginfo` returned `https://www.messenginfo.com/` with old title/snippet; live `www` redirects correctly now.
   Fix: verify Search Console property for both apex and `www`, request recrawl/removal/update of stale `www` result, keep 301 to apex.
   Effort: low to medium.
   Expected impact: high for brand trust.

3. High: non-brand search visibility is weak.
   Evidence: web search samples for Ukraine TPS / U4U re-parole / I-94 / USCIS translation did not return Messenginfo in visible top samples.
   Fix: create or upgrade 5 indexable official-source guide pages tied to realistic long-tail queries, then internally link them from homepage/services.
   Effort: medium.
   Expected impact: medium to high over 30-90 days.

4. Medium: transactional pages are mixed with SEO landing-page URLs.
   Evidence: TPS `/start` has only 690 body-text characters in Playwright snapshot and is noindex; sitemap contains `/services/tps-ukraine`, not `/start`, but production redirects the sitemap URL to `/start`.
   Fix: separate crawlable guides from wizard routes consistently across services.
   Effort: medium.
   Expected impact: medium.

5. Medium: Search Console / Bing Webmaster status is not verified from this environment.
   Evidence: no authenticated webmaster data was available in this audit.
   Fix: owner should verify domain properties, submit sitemap, inspect `/ru/services/tps-ukraine`, `/ru/services/translate-document`, `/ru`, and request recrawl after fixes.
   Effort: low.
   Expected impact: high for diagnosis speed.

## Competitor Snapshot

| Query | Observed ranking pattern | Messenginfo gap |
| --- | --- | --- |
| `Ukraine TPS 2026 EAD extension` | USCIS/E-Verify, iAmerica, Nova Ukraine, legal/nonprofit explainers | Messenginfo needs an indexable TPS/EAD explainer page with official-source citations and current dates |
| `U4U re parole guide` | USCIS/DHS PDFs, Welcome.US/CitizenPath-style guides, community discussions | Messenginfo needs one canonical re-parole guide page and supporting FAQ cluster |
| `TPS Украина 2026` | iAmerica, refugee/nonprofit pages, official-source pages | Messenginfo needs RU/UK title and content matching how Ukrainians search |
| `I-94 не обновился после репароля` | Generic legal/forum/official pages and reddit/community content | Messenginfo can target this with a narrow FAQ page, official CBP/USCIS links, and clear no-legal-advice disclaimer |
| `перевод документов для USCIS украинский английский` | Translation companies dominate | Messenginfo needs a precise page for Ukrainian document translation for USCIS, without unsupported "USCIS accepted/approved" claims |

## Keyword Opportunity Map

Quick wins:

- `TPS Украина 2026` / RU / target `/ru/services/tps-ukraine` / restore indexable TPS guide with dates, EAD notes, official links / difficulty: medium
- `TPS Україна 2026` / UK / target `/uk/services/tps-ukraine` / same as RU but unique Ukrainian copy / difficulty: medium
- `I-94 не обновился после репароля` / RU / target FAQ or guide page / answer exact pain point with CBP/USCIS links / difficulty: low
- `перевод украинского паспорта для USCIS` / RU / target `/ru/services/translate-document` / strengthen title/body around Ukrainian passport + USCIS translation / difficulty: medium
- `U4U re parole guide` / EN / target `/en/services/re-parole-u4u` / official-source re-parole guide, concise steps, disclaimer / difficulty: medium

Medium term:

- `Ukraine TPS work permit extension` / EN / dedicated TPS/EAD explainer / difficulty: medium
- `дозвіл на роботу TPS Україна` / UK / guide or FAQ cluster / difficulty: medium
- `как проверить I-94 после репароля` / RU / FAQ page / difficulty: low
- `Ukrainian USCIS document translation` / EN / translation page expansion / difficulty: high due commercial competitors

## 30-Day Growth Algorithm

Week 1:

- Fix `/[locale]/services/tps-ukraine` so it is an indexable landing page, not a redirect to noindex `/start`.
- Keep `/start` noindex as a transactional wizard.
- Verify sitemap after fix: sitemap URLs must resolve to 200 indexable pages.
- Verify Search Console/Bing Webmaster properties; submit sitemap and inspect the top 5 pages.
- Request recrawl/removal/update for stale `www` `$1 checks` result.

Week 2:

- Upgrade 5 official-source pages: TPS Ukraine, U4U re-parole, I-94, EAD/work permit, translation documents.
- Add strong internal links from homepage and `/services` to those pages.
- Add safe FAQ schema where content is factual and official-source backed.
- Make RU/UK/EN titles unique and query-matched.

Week 3:

- Publish 10 short FAQ pages based on real user pain points, one canonical answer per pain point.
- Each FAQ should include: plain-language answer, official source, last-checked date, disclaimer, CTA to relevant tool.
- Do not generate mass pages without review.

Week 4:

- Build first no-spend trust mentions: Telegram channel posts, Facebook page snippets, Ukrainian community resource pages, partner/free-aid directory references where appropriate.
- Use UTM links.
- Measure indexed pages, impressions, clicks, query list, and stale snippets weekly.

## Required Fixes

Immediate:

1. Restore `/[locale]/services/tps-ukraine` as an indexable landing page.
   File/page: `apps/web/src/app/[locale]/services/tps-ukraine/page.tsx`
   Evidence: live redirect to noindex wizard.
   Expected result: sitemap TPS URL resolves 200 with `index, follow`, canonical to itself, hreflang present.

2. Search Console cleanup for stale `www` result.
   File/page: Search Console / domain property, no code change unless redirect headers need adjustment.
   Evidence: web search sample shows old `$1 checks` snippet for `www`.
   Expected result: brand query shows current USCIS-help identity.

3. Verify sitemap URLs resolve to indexable pages.
   File/page: `apps/web/src/app/sitemap.ts`
   Evidence: sitemap has 92 URLs; TPS sitemap URL currently redirects.
   Expected result: no sitemap URL redirects to noindex page.

Next:

1. Upgrade `/ru/services/translate-document` body and title for Ukrainian-passport/USCIS translation intent.
2. Add FAQ pages for I-94 re-parole update, EAD/TPS extension, and document translation pain points.
3. Add visible last-checked dates on official-source guide pages.
4. Add internal links from homepage service cards to indexable guide pages, not directly to noindex wizards.

## Do Not Do

- Do not run ads before indexability and stale brand snippets are fixed.
- Do not spam Telegram/Facebook groups.
- Do not claim legal authority, USCIS approval, guaranteed acceptance, or law-firm status.
- Do not create mass AI pages without official-source review.
- Do not chase generic "immigration lawyer" keywords first.

## Risks And Controls

| Risk | Severity | Control |
| --- | --- | --- |
| Stale `www` result confuses brand identity | High | Search Console recrawl/removal and maintain 301 apex canonical |
| TPS page remains unindexable | Critical | Make landing page indexable; wizard stays noindex |
| Google screenshots blocked in automation | Medium | Mark SERP screenshot evidence as partial and use Search Console/manual browser confirmation |
| Content drifts into legal advice | High | Every guide uses official-source citations and non-law-firm disclaimer |
| Thin pages get indexed but do not rank | Medium | Build fewer pages with stronger official-source content and internal links |

## Next Action

Implement the TPS landing-page SEO fix first: replace the redirect at `/[locale]/services/tps-ukraine` with an indexable guide page and a CTA to `/start`, then re-run sitemap/indexability checks.
