# Audit Report — Handy & Friend + Messenginfo-merge
Date: 2026-04-29

## Executive Summary

**Handy & Friend** (`handy-friend-landing-v6`) is a production static HTML landing + Vercel serverless backend with a complete design system (`pages.css` / `main.css`), 11 service pages, a booking form, and a full lead pipeline (Supabase + Telegram). The HTML/CSS patterns and design tokens are mature and directly reusable for a content-first USCIS helper site. **Messenginfo-merge** is a heavy Next.js 14 SaaS app (carrier/DOT checks, Stripe billing, PDF reports, Prisma DB) — its landing components exist but are logistics-domain-specific; the architecture and auth patterns are relevant but most component copy is not. The **uscis-helper** repo is a fresh Next.js monorepo with 6 placeholder section components and i18n scaffolding for 3 locales, but zero USCIS-specific content or data model. The biggest gap is the actual USCIS service card data, immigration copy for en/ru/uk, and any form/calculation logic specific to immigration topics.

---

## Section 1 — Handy & Friend Inventory

### 1.1 Project Meta

**package.json**
- name: `handy-friend-landing-v6`
- version: `1.0.0`
- Dependencies: `@supabase/supabase-js`
- Script names: `test`, `vercel:guard`, `audit:prod`, `migration:drift`, `incident:dashboard`, `incident:new`, `workflow:bootstrap`, `workflow:validate`, `workflow:start`, `generate:pricing-browser`, `backfill:lead-sources`, `ops:audit`, `test:pricing-policy`, `test:ads-attribution`, `validate:pricing`, `validate:ads`, `close:sheet`

**vercel.json** — FULL CONTENT:
```json
{
  "crons": [
    { "path": "/api/process-outbox", "schedule": "0 4 * * *" },
    { "path": "/api/health?type=telegram_watchdog", "schedule": "0 5 * * *" }
  ],
  "redirects": [
    { "source": "/docs/:path*", "destination": "/", "permanent": false },
    { "source": "/ops/:path*", "destination": "/", "permanent": false },
    { "source": "/output/:path*", "destination": "/", "permanent": false },
    { "source": "/ads/:path*", "destination": "/", "permanent": false },
    { "source": "/scripts/:path*", "destination": "/", "permanent": false },
    { "source": "/supabase/:path*", "destination": "/", "permanent": false },
    { "source": "/tests/:path*", "destination": "/", "permanent": false },
    { "source": "/:path*.md", "destination": "/", "permanent": false },
    { "source": "/:path((?!robots).+).txt", "destination": "/", "permanent": false },
    { "source": "/handyfriend_10.html", "destination": "/", "permanent": true },
    { "source": "/review", "destination": "https://search.google.com/local/writereview?placeid=ChIJ6V5HHH7HwoARFgMKq_E0XK8", "permanent": false },
    { "source": "/fb", "destination": "https://www.facebook.com/profile.php?id=61588215297678&locale=en_US", "permanent": false },
    { "source": "/messenger", "destination": "https://m.me/61588215297678", "permanent": false },
    { "source": "/chat", "destination": "https://m.me/61588215297678", "permanent": false },
    { "source": "/(.*)", "has": [{ "type": "host", "value": "www.handyandfriend.com" }], "destination": "https://handyandfriend.com/$1", "permanent": true },
    { "source": "/pricing/", "destination": "/pricing", "statusCode": 301 },
    { "source": "/services/", "destination": "/services", "statusCode": 301 },
    ... (trailing-slash redirects for all 15 service pages)
    { "source": "/tv-mounting/los-angeles", "destination": "/tv-mounting", "statusCode": 301 },
    ... (city-slug redirects for all major services)
  ],
  "rewrites": [
    { "source": "/api/whatsapp-webhook", "destination": "/api/alex-webhook" },
    { "source": "/services", "destination": "/services/index.html" },
    { "source": "/tv-mounting", "destination": "/tv-mounting/index.html" },
    ... (rewrites for all 14 service pages, /pricing, /privacy, /terms, /blog/:slug, /la-neighborhoods/:slug)
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(self), payment=(self), interest-cohort=()" },
        { "key": "X-Frame-Options", "value": "SAMEORIGIN" }
      ]
    },
    { "source": "/assets/img/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/assets/css/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/assets/js/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/favicon.svg", "headers": [{ "key": "Cache-Control", "value": "public, max-age=604800" }] }
  ]
}
```

**Latest commit:** `fcd0241b5d74513cf28d0c3301e2733ece97abbe fix(data): harden test-data filtering in lead reporting`

---

### 1.2 File Structure (maxdepth 3, no node_modules/.next/.git)

Key directories and files:
```
handy-friend-landing-v6/
├── index.html                        # Homepage (main landing)
├── assets/
│   ├── css/
│   │   ├── main.css                  # Homepage CSS with :root tokens
│   │   └── pages.css                 # Service pages shared CSS
│   ├── img/                          # WebP images: tv-mounting, furniture, painting, etc.
│   └── js/
│       ├── shared.v20260429.js       # Shared JS (tracking, form, sticky CTA, burger)
│       ├── shared.js                 # Legacy (superseded)
│       ├── main.js                   # Homepage-specific JS
│       ├── price-registry.browser.js # Client-side pricing
│       └── fb-events.js, exit-intent.js, chat-proactive.js
├── services/index.html               # Services hub (11 service cards grid)
├── tv-mounting/index.html            # Service page template
├── furniture-assembly/index.html
├── interior-painting/index.html
├── flooring/index.html
├── art-hanging/index.html
├── plumbing/index.html
├── electrical/index.html
├── drywall/index.html
├── door-installation/index.html
├── vanity-installation/index.html
├── backsplash/index.html
├── cabinet-painting/index.html
├── furniture-painting/index.html
├── gallery/index.html
├── reviews/index.html
├── pricing/index.html
├── book/index.html                   # Booking form
├── blog/                             # 9 blog posts as .html files
├── la-neighborhoods/                 # Geo landing pages
├── api/                              # Vercel serverless functions
│   ├── submit-lead.js
│   ├── health.js
│   ├── notify.js
│   ├── alex-webhook.js
│   ├── telegram-webhook.js
│   ├── hunter-lead.js
│   ├── attribution-ref.js
│   ├── process-outbox.js
│   ├── ai-chat.js, ai-intake.js
│   ├── upload-lead-photos.js
│   ├── lead-photo-url.js
│   └── _lib/  (supabase-admin, rate-limit, reply-templates, telegram-templates, lead-context-store)
├── lib/                              # Shared server libs (lead-pipeline, attribution, ai-fallback, etc.)
├── supabase/
│   ├── README.md
│   └── sql/  (000–015 migration files)
├── system/                           # Multi-agent orchestration YAML configs
├── ops/                              # Watchdog reports, e2e reports
├── package.json
└── vercel.json
```

---

### 1.3 Homepage HTML

**Full `<head>` block:**
- `charset=UTF-8`, `viewport=device-width,initial-scale=1,viewport-fit=cover`
- LCP image preload: `/assets/img/hero-bg.webp` (both mobile and desktop)
- Google Fonts preload (async non-blocking): `Playfair Display:wght@700` + `DM Sans:wght@400;500;600;700`
- CSS: `assets/css/main.css?v=8`
- Meta desc, robots index/follow, canonical `https://handyandfriend.com/`
- OG: title, description, type=website, url, image `/assets/img/og.jpg` (1200×630), locale en_US, fb:page_id
- Twitter card: summary_large_image
- theme-color `#1a1a1a`
- Icons: `favicon.svg`, `favicon.ico`, `manifest.webmanifest`
- `meta[name="recaptcha-site-key"]` = `6Le1C3gsAAAAAGTzWCcplce_QCITlw1vcqQXjqEy`
- Inline: gtag stub + Consent Mode V2 defaults (ad_storage=denied, analytics_storage=granted)
- Deferred (idle 3500ms): GTM `GTM-NQTL3S6Q`, GA4 `G-Z05XJ8E281`, Google Ads `AW-17971094967`, Meta Pixel `741929941112529`
- reCAPTCHA loaded on first form focus or after 8s
- Schema.org JSON-LD: `HomeAndConstructionBusiness`, `FAQPage` (13 Q&A), `BreadcrumbList`, `OfferCatalog` (11 services)

**`<header>` HTML:**
```html
<nav class="topbar">
  <div class="ti">
    <div class="brand"><span class="bdot"></span>Handy & Friend</div>
    <div class="sp"></div>
    <div class="topnav-links">
      <a href="/services">Services</a>
      <a href="/gallery">Gallery</a>
      <a href="/reviews">Reviews</a>
      <a href="/pricing">Pricing</a>
      <a href="/book" class="topnav-cta">Book</a>
    </div>
    <button class="lbtn" id="langBtn" title="Change language">
      🌐 <span id="langTxt">EN</span><span id="langNext"> → ES</span>
    </button>
  </div>
</nav>
```
Classes used: `topbar`, `ti`, `brand`, `bdot`, `sp`, `topnav-links`, `topnav-cta`, `lbtn`

**Hero section:**
```html
<div class="hero">
  <div class="hbg"></div>
  <div class="hero-headline">
    <p class="hero-offer-eyebrow" data-i18n="heroEyebrowV2">Los Angeles · Text a Photo · 15-Min Flat Quote</p>
    <h1 class="hero-offer-title">Los Angeles Handyman — Service Call $150 · Up to 2 Hours · $75/hr After</h1>
    <p class="hero-offer-sub"><span class="hero-included-accent">Text a photo, get a flat quote in 15 minutes.</span><br>Same-day handyman across central LA.</p>
    <div class="hero-cta-row">
      <a href="https://wa.me/12133611700?text=..." style="background:#25D366">💬 Text Photo for Quote</a>
      <a href="tel:+12133611700" style="background:#2A1F14">📞 Call (213) 361-1700</a>
    </div>
  </div>
</div>
```
CSS classes: `hero`, `hbg`, `hero-headline`, `hero-offer-eyebrow`, `hero-offer-title`, `hero-offer-sub`, `hero-included-accent`, `hero-cta-row`

Background image: `/assets/img/hero-bg.webp`, overlaid with `linear-gradient(180deg, rgba(12,22,40,.46) 0%, rgba(16,26,44,.40) 48%, rgba(10,18,34,.54) 100%)`

**Services grid section:** Below hero there is a static SEO skeleton `<ul class="seo-services">` listing all 13 service links, followed by a JS-rendered pricing calculator widget (`class="rc"`, `id="calcBox"`) with tab-based service selector for: Paint 1×, Paint 2×, Flooring, Trim, TV & Art, Assembly, Plumb/Elec.

**Trust/proof strips:** Urgency strip: `background:linear-gradient(135deg,#2a1f14,#3d2e1a)` with "⚡ 3 same-day slots left this week · Text now for your 15-min quote". Then testimonials/reviews section further down.

**CTA strips:** WhatsApp + Call buttons in hero-cta-row. Sticky mobile bar (injected by `shared.v20260429.js`) with 📞 Call / 💬 WhatsApp / Get Estimate buttons.

**Footer:** Three-column grid (Services / Company / Contact). Class: none visible on homepage — uses `main.css`. On service pages: `sp-footer` / `sp-footer-inner` / `sp-footer-bottom`.

**Closing `<script>` tags on homepage:** `<script src="assets/js/main.js"></script>` — contains the full interactive calculator, i18n switcher (EN/ES/RU/UA/HE), WhatsApp text builder.

---

### 1.4 Service Page Template (tv-mounting/index.html)

**Full structure extracted:**

Head: same tracking stack as homepage (GA4, GTM, Meta Pixel, reCAPTCHA). Fonts: Playfair Display + DM Sans. CSS: `/assets/css/pages.css`.

Schema.org: Service + BreadcrumbList JSON-LD.

**Breadcrumb:**
```html
<div class="sp-breadcrumb">
  <a href="/">Home</a> <span>/</span>
  <a href="/services">Services</a> <span>/</span>
  TV Mounting
</div>
```

**Hero block:**
```html
<section class="sp-hero">
  <div class="sp-hero-inner">
    <h1>Professional TV Mounting in Los Angeles</h1>
    <p class="sp-subtitle">Any TV size. Clean, secure, level. Same-day LA service.</p>
    <div>
      <span class="sp-badge">$150 service call</span>
      <span class="sp-badge">Hidden wire: quote after photos</span>
    </div>
    <a href="tel:+12133611700" class="sp-hero-cta">Call (213) 361-1700</a>
  </div>
</section>
```

**Pricing / included list:**
- `<table class="sp-pricing-table">` with th (Service/Price) + tbody rows
- Prices: $150, Quote after photos, $150, $150, $50
- Features grid: `class="sp-features"` > `sp-feature` divs with emoji icon + h3 + p

**FAQ structure:** No dedicated FAQ section on tv-mounting page (FAQ lives on homepage as JSON-LD). Content flow: Hero → Before/After → Pricing Table → What's Included → Cross-Sell → CTA Strip → Local LA Guides → Footer.

**Related services (cross-sell):**
```html
<div class="sp-cross-sell">
  <a href="/art-hanging" class="sp-cross-card">
    <img src="/assets/img/art.webp" ...>
    <div class="sp-cross-card-body">
      <h3>Art & Mirror Hanging</h3>
      <p class="sp-from-price">$150 service call</p>
      <p>Professional hanging for artwork...</p>
    </div>
  </a>
  ...
</div>
```

**CTA strip:**
```html
<section class="sp-cta-strip">
  <h2>Ready to Mount Your TV?</h2>
  <p>Same-day appointments available. Call now or book online.</p>
  <a href="tel:+12133611700" class="sp-btn-white">Call (213) 361-1700</a>
  <a href="/book?service=tv_mounting" class="sp-btn-white" style="background:transparent;border:2px solid #fff;color:#fff">Book Online</a>
</section>
```

CSS classes on service pages: `sp-header`, `sp-header-inner`, `sp-brand`, `sp-nav`, `sp-nav-cta`, `sp-burger`, `sp-breadcrumb`, `sp-hero`, `sp-hero-inner`, `sp-subtitle`, `sp-badge`, `sp-hero-cta`, `sp-section`, `sp-section-inner`, `sp-section-alt`, `sp-pricing-table`, `sp-price`, `sp-note`, `sp-ba`, `sp-ba-caption`, `sp-features`, `sp-feature`, `sp-feature-icon`, `sp-cross-sell`, `sp-cross-card`, `sp-cross-card-body`, `sp-from-price`, `sp-cta-strip`, `sp-btn-white`, `sp-trust`, `sp-trust-item`, `sp-trust-num`, `sp-trust-label`, `sp-footer`, `sp-footer-inner`, `sp-footer-contact`, `sp-footer-bottom`

Closing `<script>`: `<script src="/assets/js/shared.v20260429.js"></script>`

---

### 1.5 Services Index (services/index.html)

**Grid structure:**
```html
<section class="sp-section">
  <div class="sp-section-inner">
    <div class="sp-services-grid">
      <a href="/tv-mounting" class="sp-service-card">
        <img src="/assets/img/tv-mounting.webp" alt="..." width="400" height="267" loading="lazy">
        <div class="sp-service-card-body">
          <h3>TV Mounting</h3>
          <div class="sp-from">$150 service call</div>
          <p class="sp-desc">Professional TV mounting with clean cable management...</p>
        </div>
      </a>
      ... (11 cards total)
    </div>
  </div>
</section>
```

Services listed: TV Mounting, Furniture Assembly, Interior Painting, Flooring Installation, Art & Mirror Hanging, Plumbing, Electrical, Drywall Repair, Door Installation & Repair, Vanity Installation, Backsplash Installation.

Hero has 3 CTA buttons: 📞 Call / 💬 Text for Quote / Book Online →. Trust bar: 20+ Happy Clients / 11 Services / Same-Day Available / 15 min Quote by Text.

---

### 1.6 Booking Form (book/index.html)

**Form fields:**
```html
<form id="sp-lead-form" class="sp-form">
  <label for="service_type">Service Needed</label>
  <select name="service_type" id="service_type">
    <!-- 12 options: tv_mounting, furniture_assembly, interior_painting, flooring,
         art_mirrors, drywall, plumbing, electrical, door_installation,
         vanity_installation, backsplash, other -->
  </select>

  <label for="full_name">Your Name</label>
  <input type="text" name="full_name" id="full_name" placeholder="John Smith" autocomplete="name">

  <label for="phone">Phone Number <span class="sp-required">*</span></label>
  <input type="tel" name="phone" id="phone" placeholder="(213) 555-1234" required autocomplete="tel">

  <label for="email">Email (optional)</label>
  <input type="email" name="email" id="email" placeholder="you@email.com" autocomplete="email">

  <label for="zip">ZIP / Area</label>
  <input type="text" name="zip" id="zip" placeholder="90038" autocomplete="postal-code">

  <label for="message">Tell us more (optional)</label>
  <textarea name="message" id="message" placeholder="Describe your project..."></textarea>

  <!-- Honeypot anti-bot -->
  <input type="text" name="website" style="display:none;position:absolute;left:-9999px" tabindex="-1" autocomplete="off">

  <button type="submit">Get Free Estimate</button>
  <div class="sp-form-trust">🔒 Same-day response · Written scope before work · Service Call $150 · Insured</div>
</form>
```

Validation: `required` on phone only. JS validates `phone.replace(/\D/g,'').length >= 10`. Honeypot check.

Form POSTs to: `fetch('/api/submit-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' } })`

**Mobile sticky CTA bar** (hardcoded in book page, also injected by shared.js on other pages):
```html
<div class="sp-book-sticky">
  <a href="tel:+12133611700">📞 Call (213) 361-1700</a>
  <a href="https://wa.me/12133611700">WhatsApp</a>
</div>
```

**Trust badges:** 4-item trust bar: 30 min Response Time / 9+ Services / 5★ Customer Rating / $0 Estimate Cost.

---

### 1.7 main.css Extracts

**`:root` CSS variables:**
```css
:root {
  --bg: #F5F0E8;
  --card: rgba(255,255,255,0.88);
  --ink: #2A1F14;
  --ink2: rgba(42,31,20,0.68);
  --ink3: rgba(42,31,20,0.42);
  --gold: #B8892C;
  --glt: rgba(184,137,44,0.11);
  --gbd: rgba(184,137,44,0.24);
  --st: rgba(42,31,20,0.09);
  --st2: rgba(42,31,20,0.05);
  --sh: 0 12px 40px rgba(42,31,20,0.10);
  --sh2: 0 24px 72px rgba(42,31,20,0.13);
  --safeB: env(safe-area-inset-bottom);
  --navH: 56px;
  --fs: "Playfair Display", Georgia, serif;
  --fb: "DM Sans", system-ui, sans-serif;
  --page: 1200px;
  --colr: 400px;
  --r: 14px;
}
```

**Base styles:**
```css
*, { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
body {
  font-family: var(--fb);
  background: var(--bg);   /* #F5F0E8 warm off-white */
  color: var(--ink);       /* #2A1F14 dark brown */
  padding-top: 56px;
  padding-bottom: calc(80px + var(--safeB));
  min-height: 100vh;
  overflow-x: hidden; width: 100%;
}
a { color: inherit; text-decoration: none; }
img { display: block; width: 100%; height: 100%; object-fit: cover; }
```

**Typography scale:**
- Hero: `font-size: clamp(26px, 5.5vw, 66px)`, `font-family: var(--fs)` (Playfair Display), `font-weight: 700`
- Hero subtitle: `font-size: clamp(12px, 1.4vw, 16px)`, DM Sans, weight 400
- Hero offer title: `font-size: clamp(38px, 7.5vw, 96px)`, DM Sans, weight 700
- Eyebrow: `font-size: clamp(11px, 1.4vw, 14px)`, uppercase, `letter-spacing: .14em`

**Container/wrapper:**
- `.ti` (topbar inner): `max-width: var(--page); margin: 0 auto; display: flex; height: var(--navH); padding: 0 18px;`
- Desktop: `.ti { padding: 0 56px; height: 68px; }`

**Button styles:**
- `.lbtn`: `height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--st); background: rgba(255,255,255,.60); font-size: 11px; font-weight: 700;`
- `.topnav-cta`: `background: var(--gold)!important; color: #fff!important; font-weight: 600!important; padding: 6px 14px!important; margin-left: 4px;`

**Color tokens:** `--bg #F5F0E8`, `--ink #2A1F14`, `--gold #B8892C`, `--card rgba(255,255,255,0.88)`

Search bar CTA: `background: linear-gradient(135deg, #d4af37 0%, #ffdd57 100%); color: #1a1410;`

---

### 1.8 pages.css Extracts

**`:root` in pages.css:**
```css
:root {
  --sp-orange: #ff6b35;
  --sp-orange-hover: #e55a28;
  --sp-dark: #1a1a2e;
  --sp-dark2: #16213e;
  --sp-light: #f8f9fa;
  --sp-white: #ffffff;
  --sp-gray: #6c757d;
  --sp-border: #dee2e6;
  --sp-shadow: 0 2px 12px rgba(0,0,0,.08);
  --sp-radius: 12px;
  --sp-font: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --sp-heading: 'Playfair Display', Georgia, serif;
  --sp-max-w: 1140px;
}
```

**Complete selector extracts:**

`.sp-services-grid`:
```css
display: grid;
grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
gap: 24px;
max-width: 1000px;
margin: 0 auto;
```

`.sp-service-card`:
```css
background: var(--sp-white);
border: 1px solid var(--sp-border);
border-radius: var(--sp-radius);   /* 12px */
overflow: hidden;
text-decoration: none;
color: inherit;
transition: transform .2s, box-shadow .2s;
```

`.sp-service-card img`:
```css
width: 100%; height: 200px; object-fit: cover;
```

`.sp-service-card:hover`:
```css
transform: translateY(-4px);
box-shadow: 0 8px 24px rgba(0,0,0,.12);
color: inherit;
```

`.sp-cross-card`:
```css
background: var(--sp-white);
border: 1px solid var(--sp-border);
border-radius: var(--sp-radius);
overflow: hidden;
transition: transform .2s, box-shadow .2s;
text-decoration: none;
color: inherit;
```

`.sp-cross-card img`:
```css
width: 100%; height: 180px; object-fit: cover;
```

`.sp-cross-card:hover`:
```css
transform: translateY(-4px);
box-shadow: 0 8px 24px rgba(0,0,0,.12);
```

`.sp-cross-card:hover img`:
```css
transform: scale(1.04);
```

`.sp-cta-strip`:
```css
background: var(--sp-orange);   /* #ff6b35 */
color: #fff;
text-align: center;
padding: 48px 20px;
```

`.sp-book-sticky`:
```css
/* hidden by default */
display: none;
```

`@media(max-width:600px) .sp-book-sticky`:
```css
display: flex;
position: fixed;
bottom: 0; left: 0; right: 0;
background: var(--sp-dark);
padding: 10px 16px;
z-index: 90;
gap: 10px;
box-shadow: 0 -2px 12px rgba(0,0,0,.25);
```

`.sp-book-sticky a`:
```css
flex: 1;
background: var(--sp-orange);
color: #fff;
text-align: center;
padding: 12px 6px;
border-radius: 8px;
font-weight: 700;
font-size: 14px;
```

`.sp-header`:
```css
background: var(--sp-dark);   /* #1a1a2e */
color: #fff;
position: sticky;
top: 0; z-index: 100;
padding: 0 20px;
```

`.sp-footer`:
```css
background: var(--sp-dark);
color: rgba(255,255,255,.7);
padding: 48px 20px 32px;
```

`.sp-footer-inner`:
```css
max-width: var(--sp-max-w);
margin: 0 auto;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
gap: 32px;
```

**Additional `.sp-*` classes found:**
- `.sp-hero`: `background: linear-gradient(135deg, var(--sp-dark) 0%, var(--sp-dark2) 100%); padding: 60px 20px; text-align: center;`
- `.sp-hero h1`: `font-family: var(--sp-heading); font-size: clamp(28px,5vw,48px); font-weight: 800;`
- `.sp-badge`: `background: var(--sp-orange); color: #fff; font-weight: 700; font-size: 18px; padding: 8px 20px; border-radius: 8px;`
- `.sp-pricing-table`: `width: 100%; border-collapse: collapse; max-width: 700px;`
- `.sp-trust`: `display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; padding: 24px 0;`
- `.sp-trust-num`: `font-size: 28px; font-weight: 800; color: var(--sp-orange);`
- `.sp-features`: `display: grid; grid-template-columns: repeat(auto-fit, minmax(260px,1fr)); gap: 20px; max-width: 800px;`
- `.sp-form`: `max-width: 560px; background: var(--sp-white); border: 1px solid var(--sp-border); border-radius: 12px; padding: 32px;`
- `.sp-gallery-grid`: `display: grid; grid-template-columns: repeat(auto-fill, minmax(320px,1fr)); gap: 24px;`

**Media queries:**
- `@media(max-width:768px)`: nav links smaller font/padding
- `@media(max-width:600px)`: burger shown, nav becomes dropdown, sticky bar shown, pricing table scroll
- `@media(max-width:480px)`: hero badges become block, CTA full-width
- `@media(max-width:420px)`: CTA strip buttons stack vertically

---

### 1.9 shared.js Patterns

**File:** `/assets/js/shared.v20260429.js` — **470 lines**

**Function names defined:**
- `gtag` (dataLayer push wrapper)
- `idle` (requestIdleCallback with 3500ms timeout fallback)
- `loadScript` (async script loader)
- `getOrCreateSessionId` (localStorage `hf_session_id` with `sess_<ts>_<rand>` format)
- `getStored` (sessionStorage getter)
- `buildAttrMeta` (collects UTM + click IDs + referrer + landing_page)
- `postCtaEvent` (POSTs to `/api/health?type=cta_event` via sendBeacon or fetch)
- `window.emitCoreEvent` (fires gtag event + pushes to dataLayer)
- `window.collectAttribution` (collects UTM + click IDs + GA4 client ID from cookie)
- `window.handleLeadForm` (form submit handler — see below)

**Burger menu pseudocode:**
```
burger = getElementById('spBurger')
spNav = getElementById('spNav')
burger.click → toggle 'open' class on spNav, update aria-expanded + innerHTML (☰/✕)
spNav links.click → close nav
document.click outside burger/nav → close nav
```

**Sticky CTA (mobile):**
```
On DOMContentLoaded:
  if !.sp-book-sticky exists AND path !== '/book':
    derive serviceSlug from pathname
    build WhatsApp URL with service context
    inject .sp-book-sticky div with 3 links: Call / WhatsApp / Get Estimate
    attach click listeners → postCtaEvent with {service_slug, button_label, source_widget:'mobile_sticky_bar'}
    WhatsApp click: preventDefault → POST /api/attribution-ref (sends full UTM + gclid + service_slug)
      → on success, use wa_url from response, else fallback to direct wa.me link
```

**Form submit handler (handleLeadForm):**
```
submit event → preventDefault
validate: phone digits >= 10, honeypot empty
disable button, setText 'Sending...'
collect: full_name, phone, email, service_type, message, zip, source='website_service_page', attribution=collectAttribution()
POST /api/submit-lead (Content-Type: application/json)
on ok response:
  gtag('set', 'user_data', {email, phone_number}) — Enhanced Conversions
  emitCoreEvent('generate_lead', {value:100, currency:'USD'})
  emitCoreEvent('form_submit', {value:100, currency:'USD'})
  fbq('track', 'Lead', {content_name: service_type})
  replace form HTML with success message + call link
on error: re-enable button, alert with phone number
```

**Event tracking patterns:**
- Click delegation on all `a[href]`: fires `phone_click`, `email_click`, `whatsapp_click` events via both gtag and postCtaEvent
- WhatsApp clicks additionally fire Google Ads conversion `AW-17971094967/whatsapp_lead` and `fbq('trackCustom', 'whatsapp_click')`
- UTM/click-ID persistence: all params stored in sessionStorage as `hf_<key>`
- Web Vitals sent to GA4 as events (LCP, INP, CLS, FCP, TTFB) via web-vitals@3.5.2 UMD from CDN

---

### 1.10 Supabase Patterns

**README.md full text:**

Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

SQL rollout order: 001→006 core + analytics + conversations.

Runtime flow:
1. Browser → `POST /api/submit-lead` → writes `public.leads` + `public.lead_events`
2. Browser → `POST /api/upload-lead-photos` → writes to private bucket `lead-photos` + `public.lead_photos`
3. Telegram alert sent server-side only
4. AI intake via `/api/append-conversation`
5. Signed photo URLs via `/api/lead-photo-url`

Safety: No direct browser writes to CRM tables. No service-role key in frontend. Private Storage bucket. Rate limits on ai-chat, submit-lead, upload-lead-photos.

**SQL files:**
| File | Purpose |
|---|---|
| 000_RUN_ALL_IN_SUPABASE.sql | Orchestration script |
| 001_leads_core.sql | `public.leads` + `public.lead_events` core schema |
| 002_rls_policies.sql | Enable RLS; server-only writes |
| 003_storage_private_bucket.sql | Private `lead-photos` bucket |
| 004_analytics_views.sql | Analytics-ready views |
| 005_conversations_patch.sql | `ai_conversations` support without a lead |
| 006_leads_schema_sync.sql | Sync patch for missing columns in legacy projects |
| 007_pipeline_columns.sql | Pipeline enhancement columns |
| 008_backfill.sql | Backfill for pipeline columns |
| 009_constraints.sql | Data integrity constraints |
| 010_response_time_and_audit.sql | Response time calc + event audit logging |
| 011_rls_complete.sql | Complete RLS pass |
| 012_ultimate_analytics.sql | Extended analytics |
| 013_test_isolation.sql | Test isolation schema |
| 014_confirm_jobs_link.sql | Jobs link confirmation |
| 014_fix_dashboard_and_jobs_link.sql | Dashboard fix |
| 014_rollback.sql | Rollback migration |
| 015_pipeline_enforcement.sql | Pipeline enforcement |

---

### 1.11 API Routes

All in `/api/`:

| File | What it does | Env vars used |
|---|---|---|
| `submit-lead.js` | Validates + deduplicates lead, writes to Supabase `leads` + `lead_events`, runs lead-pipeline, fires Telegram alert | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `RESEND_API_KEY` |
| `health.js` | Unified health + analytics endpoint: GET → diagnostics; `?type=funnel/fb/stats/cta_event` views | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STATS_SECRET_KEY`, `TELEGRAM_BOT_TOKEN` |
| `notify.js` | Internal Telegram/SMS notifier; requires `X-HF-Notify-Secret` header; NOT for direct browser use | `HF_NOTIFY_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TWILIO_*` |
| `alex-webhook.js` | Facebook Messenger + WhatsApp webhook: handles inbound messages, calls Alex AI, sends replies; deduplication | `FB_VERIFY_TOKEN`, `FB_PAGE_ACCESS_TOKEN`, `DEEPSEEK_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `telegram-webhook.js` | Telegram bot webhook: inbound messages → Alex AI → reply; owner notification | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `DEEPSEEK_API_KEY`, `SUPABASE_URL` |
| `hunter-lead.js` | Receives leads from OpenClaw scrapers (Nextdoor/Craigslist hunter posts); fires Telegram alert; does NOT write to `leads` table directly | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| `attribution-ref.js` | Stores UTM + gclid attribution before WhatsApp open; returns enriched wa_url with ref param | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `process-outbox.js` | Cron-driven outbox processor (0 4 * * *) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN` |
| `ai-chat.js` | Stateless AI chat (for website chat widget) | `DEEPSEEK_API_KEY`, `OPENAI_API_KEY` |
| `ai-intake.js` | AI-assisted intake/triage | `DEEPSEEK_API_KEY`, `SUPABASE_URL` |
| `upload-lead-photos.js` | Upload compressed photos to private Supabase bucket | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `lead-photo-url.js` | Generate signed URLs for private lead photos | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

---

## Section 2 — Messenginfo-merge Inventory

### 2.1 Project Meta

**package.json**
- name: `messenginfo-project`
- version: `1.0.0`
- Framework: Next.js 14.2.35, React 18.2.0
- Key dependency names: `@google-cloud/storage`, `@google/generative-ai`, `@googlemaps/js-api-loader`, `@next/third-parties`, `@opentelemetry/*` (full OTel suite), `@pdf-lib/fontkit`, `@prisma/client`, `@radix-ui/react-slot`, `@react-pdf/renderer`, `@sentry/nextjs`, `bcryptjs`, `cheerio`, `class-variance-authority`, `clsx`, `fast-xml-parser`, `lru-cache`, `lucide-react`, `next-auth`, `openai`, `pdf-lib`, `pg`, `pino`, `prisma`, `qrcode`, `react-google-recaptcha`, `stripe`, `tailwind-merge`, `use-places-autocomplete`, `zod`, `zustand`
- Dev dependencies: `@playwright/test`, `@typescript-eslint/parser`, `autoprefixer`, `c8`, `dotenv-cli`, `eslint`, `husky`, `lighthouse`, `lint-staged`, `nock`, `pino-pretty`, `postcss`, `prettier`, `tailwindcss`, `tsx`, `typescript`
- Engine: `node: 20.x`
- Script count: 100+ (dev, build, test:ci, smoke:*, guard:*, stripe:*, tg:*, svc:*, pdf:*, agent:*, monitoring:*, migrate, etc.)

**vercel.json** — full content:
```json
{
  "buildCommand": "npm run build:safe",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "installCommand": "HUSKY=0 npm ci --legacy-peer-deps",
  "devCommand": "npm run dev",
  "regions": ["iad1"],
  "crons": [
    { "path": "/api/cron/monitoring", "schedule": "0 14 * * *" },
    { "path": "/api/cron/telegram-digest", "schedule": "0 13 * * *" },
    { "path": "/api/cron/ofac-refresh", "schedule": "0 */6 * * *" }
  ],
  "functions": {
    "app/api/public/check/route.js": { "maxDuration": 30 },
    "app/api/cron/monitoring/route.ts": { "maxDuration": 60 },
    "app/api/cron/telegram-digest/route.ts": { "maxDuration": 60 },
    "app/api/cron/ofac-refresh/route.ts": { "maxDuration": 300 }
  },
  "headers": [
    { "source": "/(.*)", "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "X-XSS-Protection", "value": "1; mode=block" }
    ]}
  ]
}
```

**Latest commit:** `75c9d60f5435d27fd04727f9b63532006fa3d628 fix: PDF font for Latin; add ?q= support`
**Uncommitted files count:** 33

---

### 2.2 Structure (maxdepth 3, no node_modules/next/git/public)

Key directories:
```
messenginfo-merge/
├── app/
│   ├── layout.jsx              # Root layout with GA, GTM, schema.org
│   ├── page.tsx                # Homepage: HeroSearch + EssentialToolsSection + MiniWidgets + ServiceCards + TrustBar + BottomConnectBar
│   ├── globals.css
│   ├── (app)/                  # Authenticated app routes
│   ├── (auth)/                 # Auth routes
│   ├── (public)/               # Public routes
│   ├── api/                    # 30+ API route groups
│   ├── check/                  # MC/DOT check page
│   ├── route-planner/          # Logistics route planner
│   ├── billing/, dashboard/, business/, vehicle/, me/, messages.*
├── components/
│   ├── landing/                # 17 landing components (see 2.4)
│   ├── check/, dashboard/, analytics/, auth/, brand/, etc.
├── lib/                        # Utilities, env, analytics, UI
├── prisma/
│   └── schema.prisma
├── styles/
├── tests/, agents/, scripts/
└── package.json, vercel.json, next.config.mjs, tailwind.config.cjs, etc.
```

---

### 2.3 Routes

**app/ top-level:**
`(app)`, `(auth)`, `(public)`, `(testing)`, `actions`, `api`, `auth`, `billing`, `business`, `check`, `components`, `connect`, `contact`, `dashboard`, `dev`, `error.tsx`, `favicon.ico`, `globals.css`, `layout.jsx`, `legal`, `loading.tsx`, `logistics`, `me`, `messages.*.json` (en/es/ru/uk/zh), `middleware.js`, `not-found.tsx`, `page.tsx`, `pricing`, `providers.client.js`, `revenue`, `robots.ts`, `route-planner`, `sitemap.ts`, `vehicle`

**app/api/ route groups (partial):**
`analytics`, `ask`, `auth`, `billing`, `business`, `catalog`, `check`, `cron`, `debug`, `dev`, `dispatcher`, `distance`, `driver`, `evidence-pack`, `facebook`, `fs`, `git`, `google`, `health`, `help`, `history`, `integrations`, `logistics`, `maps`, `me`, `metrics`, `monitoring`, `onboarding`, `ops`, `pdf`, and more.

---

### 2.4 Landing Components

All in `/components/landing/`:

| File | Purpose (first 20 lines) |
|---|---|
| `HeroSearch.tsx` | Interactive search bar with multi-locale translations (en/es/ru/uk/zh); detects input type (MC/DOT/VIN); fires GA events; shows Captcha; links to /check |
| `EssentialToolsSection.tsx` | Enterprise SaaS tools grid; Broker Control, OFAC Scan, etc.; uses Lucide icons + Tailwind; light section |
| `ServiceCards.tsx` | Card grid of services (broker-control, etc.); reads theme from localStorage; uses useRouter |
| `TrustBar.tsx` | Theme toggle (dark/light); reads from localStorage `mi_theme` |
| `LandingHeader.tsx` | Sticky header; MessengInfo logo link + "Run Free Check" button routing to /check |
| `Footer.tsx` | Simple footer; build info (SHA); links to /check, /pricing, /legal |
| `MiniWidgets.tsx` | Returns null (statistics removed) |
| `LandingHero.tsx` | Search form → `router.push('/check?q=...')`; input + submit |
| `Hero.tsx` | Static hero: "Carrier & Risk Checks in Seconds" + Telegram link + CTA to /check |
| `HowItWorks.tsx` | 3-step guide: Choose service → Enter MC/DOT/VIN → Get result + PDF |
| `TrustStrip.tsx` | Trust strip (content unknown beyond file listing) |
| `ProductGrid.tsx` | Product grid (content unknown beyond file listing) |
| `ServiceGrid.tsx` | Service grid variant |
| `HeroSearch.tsx` | (same as above, primary) |
| `FooterLegal.tsx` | Legal footer variant |
| `LegalBlock.tsx` | Legal text block |
| `Reveal.tsx` | Scroll-reveal animation component |
| `MiniMetrics.tsx` | Metrics mini-section (likely replaced by MiniWidgets→null) |

---

### 2.5 App Shell

**layout.jsx** (root layout):
- Imports: `./globals.css`, `Suspense`, `GoogleAnalytics` from `@next/third-parties/google`, `AnalyticsRouter` component, `getBaseUrl`
- Metadata object: `title: "MessengInfo — Carrier Risk Assessment"`, description for carrier/DOT/VIN/OFAC
- GA ID: `NEXT_PUBLIC_GA_ID || process.env.Google_analitics`
- Schema.org: Organization JSON-LD rendered inline
- HTML shell: `<html lang="en"><body>...</body></html>` with `<GoogleAnalytics>`, `<Suspense><AnalyticsRouter /></Suspense>`, `{children}`

**page.tsx** (homepage sections composed, in order):
1. `HeroSearch` (eager, no lazy — above-the-fold critical)
2. `EssentialToolsSection` (dynamic, ssr:false, with Suspense fallback pulse)
3. `MiniWidgets` (dynamic, ssr:false — currently returns null)
4. `ServiceCards` (dynamic, lazy)
5. `TrustBar` (dynamic, ssr:false)
6. `BottomConnectBar` (dynamic, ssr:false)

Wrapper: `<MarketingShell>` from `@/components/marketing/MarketingShell`

---

### 2.6 Env Requirements (.env.example variable names only)

Server-side:
`APP_URL`, `APP_BASE_URL`, `DATABASE_URL`, `DATABASE_SSL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLIC_KEY`, `FMCSA_WEB_KEY`, `FMCSA_API_KEY`, `FMCSA_USER_AGENT`, `NHTSA_USER_AGENT`, `OFAC_USER_AGENT`, `OFAC_SLS_URLS`, `OFAC_SLS_DELTA_URLS`, `OFAC_CACHE_TTL_MS`, `OFAC_CACHE_DIR`, `OFAC_API_KEY`, `OFAC_API_SECRET`, `OFAC_API_BASE_URL`, `OPENCORPORATES_API_TOKEN`, `OPEN_CORPORATES_USER_AGENT`, `HOST`, `BOT_SECRET`, `CRON_SECRET`, `PDF_TOKEN_SECRET`, `PDF_TOKEN_SECRET_PREV`, `STAGING_BOT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CHAT_ID`, `TELEGRAM_ADMIN_CHAT_ID`, `EXTERNAL_BASE_URL`, `STRIPE_PRICE_ID_STARTER/FLEX/PRO/ULTRA` (+ legacy aliases), `GOOGLE_SERVICE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_MAPS_SERVER_KEY` (+ legacy aliases), `MAP_ENRICHMENT_LINKS`, `GCS_BUCKET_NAME`, `GH_TOKEN_MESSENGINFO`, `VERCEL_OIDC_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ALERT_FROM_EMAIL`, `ALERT_TO_EMAIL`, `RECAPTCHA_SECRET_KEY`, `reCAPTCHA_secret_key`, `CAPTCHA_*` (6 vars), `BILLING_TEST_BYPASS*` (3 vars), `SERVER_SALT`, `KONTUR_FOCUS_API_KEY`, `KONTUR_FOCUS_API_BASE_URL`, `REPUTATION_API_KEY`, `REPUTATION_API_BASE_URL`, `SENTRY_DSN`, `LOG_LEVEL`, `SKIP_DB_ON_BUILD`, `TEST_MODE`, `REPORT_LINK_SECRET`, `REPORT_SIGNING_SECRET`, `VERIFY_BASE_URL`

Client-side (NEXT_PUBLIC_*):
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`

Legacy: `Google_analitics`

---

### 2.7 Prisma / DB Schema

**prisma/schema.prisma** — Models found:
- `CheckHistory` — stores check requests: serviceId, requestId, userId, traceId, input (JSON), summary (JSON), sections (JSON), status, raw, warnings, errors, sources, pdfUrl, createdAt, durationMs. Maps to `check_history` table.

Only 1 model in schema (additional tables likely managed via raw SQL / pg migrations).

---

## Section 3 — USCIS-helper Current State

### 3.1 Source State

**Latest commit:** `8767045471b6c211567c15d811663915bf279eeb fix(contact): catch unhandled errors to surface real error in logs`

**app/[locale]/page.tsx** — sections rendered (in order):
1. `HeroSection` — from `@/components/sections/HeroSection`
2. `ServicesSection` — from `@/components/sections/ServicesSection`
3. `HowItWorksSection` — from `@/components/sections/HowItWorksSection`
4. `WhyMessenginfoSection` — from `@/components/sections/WhyMessenginfoSection`
5. `ContactSection` — from `@/components/sections/ContactSection`
6. `DisclaimerSection` — from `@/components/sections/DisclaimerSection`

**Sections files** in `/apps/web/src/components/sections/`:
- `ContactSection.tsx`
- `DisclaimerSection.tsx`
- `HeroSection.tsx`
- `HowItWorksSection.tsx`
- `ServicesSection.tsx`
- `WhyMessenginfoSection.tsx`

**App routes** in `/apps/web/src/app/`:
- `[locale]/` — locale-routed pages: `_actions`, `disclaimer`, `error.tsx`, `layout.tsx`, `not-found.tsx`, `page.tsx`, `privacy`, `terms`
- `api/`
- `globals.css`, `layout.tsx`, `manifest.ts`, `page.tsx`, `robots.ts`, `sitemap.ts`

**messages/en.json top-level keys:** `metadata`, `header`, `footer`, `home`, `legal`, `errors`

### 3.2 Live State

```
GET https://messenginfo.com/en  → HTTP/2 200 (text/html; charset=utf-8) — LIVE
GET https://messenginfo.com/ru  → HTTP/2 200 (text/html; charset=utf-8) — LIVE
GET https://messenginfo.com/uk  → HTTP/2 200 (text/html; charset=utf-8) — LIVE
```

All 3 locales return 200. Cache-Control: private, no-cache, no-store (no CDN caching). Served via Cloudflare (NEL header present).

---

## Section 4 — Transfer Map

### 4.1 Handy → USCIS-helper (what to port)

| Handy element | Actual value/pattern | Action for new project |
|---|---|---|
| Design tokens (pages.css `:root`) | `--sp-orange:#ff6b35`, `--sp-dark:#1a1a2e`, `--sp-light:#f8f9fa`, `--sp-radius:12px`, `--sp-shadow:0 2px 12px rgba(0,0,0,.08)`, `--sp-max-w:1140px` | Adapt to USCIS palette — keep radius/shadow pattern, swap orange → USCIS brand color |
| Typography | Playfair Display (headings) + DM Sans (body); `clamp(28px,5vw,48px)` for h1, `clamp(16px,2.5vw,20px)` for subtitles | Keep same font pairing or swap Playfair for another serif; clamp scale is good |
| Service card grid | `grid-template-columns:repeat(auto-fill,minmax(300px,1fr))` + `border-radius:12px` + `translateY(-4px)` hover | Port exactly for USCIS service topic cards |
| Service card markup | `<a class="sp-service-card"><img height=200 object-fit:cover><div class="sp-service-card-body"><h3>...<div class="sp-from">...<p class="sp-desc">` | Use same structure, replace price with e.g. "Free" or processing time |
| Hero gradient | `background:linear-gradient(135deg,#1a1a2e,#16213e)` | Good dark authoritative feel — works for immigration context |
| CTA strip | `background:#ff6b35; padding:48px 20px; text-align:center` with white button | Port pattern, change color to USCIS brand |
| Sticky mobile bar | `.sp-book-sticky` injected by JS; 3 buttons: Call/WhatsApp/Estimate; fires attribution events | Port for USCIS: Contact/Telegram/Get Started — remove WhatsApp attribution API |
| Booking form | `sp-form` with honeypot, phone validation, `POST /api/submit-lead`, success state | Port pattern for USCIS contact form; adapt fields (case type, alien number, etc.) |
| Trust bar | flex row; `font-size:28px font-weight:800 color:var(--orange)` numbers + `font-size:13px` labels | Port: replace "20+ Clients" with USCIS-relevant stats |
| Breadcrumb | `.sp-breadcrumb` — simple slash-separated, `font-size:13px`, `max-width:1140px auto` | Port as-is |
| Footer | 3-column `repeat(auto-fit,minmax(200px,1fr))` dark bg grid | Port structure directly |
| Pricing table | `.sp-pricing-table` with `th{background:#1a1a2e}` + `.sp-price{color:orange}` | Adapt for USCIS fee table (USCIS filing fees, processing times) |
| Header | `.sp-header` sticky dark; hamburger at 600px; `.sp-nav-cta` orange CTA button | Port — already similar to messenginfo LandingHeader |
| `shared.js` UTM/attribution pattern | `sessionStorage.setItem('hf_'+k)` for 13 params; `collectAttribution()` | Port UTM persistence + GA4 event emitter for USCIS |
| Tracking setup | Consent Mode V2 defaults; deferred third-party loading via `idle()`; `sendBeacon` fallback | Port deferred loading pattern — required for performance |

---

### 4.2 Old Messenginfo-merge → What's reusable

| Old file/component | What's reusable | What to drop |
|---|---|---|
| `HeroSearch.tsx` | Multi-locale translation object pattern (en/es/ru/uk/zh inline); search dispatch logic; Captcha integration | Carrier/DOT/VIN-specific content; replace with immigration topic search |
| `LandingHeader.tsx` | Sticky header structure with logo + single CTA nav; Tailwind classes | "Run Free Check" button → "Start Application" or similar |
| `Footer.tsx` | Simple minimal footer; build info display pattern | All logistics links |
| `EssentialToolsSection.tsx` | Enterprise tools grid layout (Lucide icons + Tailwind); section contrast pattern (light after dark hero) | All carrier/DOT content |
| `ServiceCards.tsx` | Card grid with theme toggle; localStorage pattern; `useRouter` dispatch | Carrier service IDs; replace with immigration topics |
| `HowItWorks.tsx` | 3-step guide pattern (number + title + description) | Carrier-specific step text |
| `app/layout.jsx` | GA + schema.org Organization setup; Suspense+dynamic import pattern | Carrier-specific metadata |
| `app/page.tsx` | Dynamic import + Suspense loading skeleton pattern; `MarketingShell` wrapper | All carrier-specific component imports |
| `Reveal.tsx` | Scroll-reveal animation — generic, reusable | Nothing |
| `TrustStrip.tsx` | Trust strip layout | Carrier-specific trust claims |
| Prisma `CheckHistory` model | JSON sections/summary pattern for storing check results | serviceId semantics (adapt to USCIS case types) |
| Auth system (next-auth) | Full auth flow with bcryptjs, session management | Nothing from this |
| OTel observability setup | `instrumentation.ts`, pino logger, Sentry config | All; not needed for USCIS MVP |
| Tailwind + class-variance-authority setup | `tailwind.config.cjs`, `postcss.config.cjs`, biome.json | Nothing |
| Security headers in vercel.json | DENY X-Frame-Options (stricter than Handy's SAMEORIGIN) | Nothing |
| `.env.example` structure | env validation approach (lib/env/schema.ts + server.ts + client.ts) | All logistics-specific vars |

---

### 4.3 Gaps — must build from scratch

The following exist in neither source in usable form for a USCIS helper:

1. **USCIS service card data model** — structured list of immigration form types (I-485, I-130, N-400, etc.) with descriptions, current filing fees, processing time ranges, form links
2. **Immigration topic navigation** — topic taxonomy: Family-based, Employment-based, Citizenship, Asylum, DACA, Adjustment of Status — none of this exists anywhere
3. **Case status / deadline tracker UI** — timeline visualization for USCIS processing stages; none in either source
4. **USCIS fee table** — filing fees per form type; needs official USCIS fee schedule data; the Handy pricing table structure can be reused but data is entirely missing
5. **i18n copy for en/ru/uk locales** — `uscis-helper/messages/en.json` has placeholder keys `home.hero`, `home.services.items[]`, `home.how.steps[]`, `home.why.points[]`; none of the actual immigration-specific text is written
6. **FAQ for immigration** — USCIS-specific Q&A (what documents are needed, how long does it take, what if I get an RFE, etc.); Handy has a good FAQ-in-JSON-LD pattern to reuse structurally
7. **Form/tool for case status lookup** — input: receipt number → display USCIS case status; no equivalent in either source
8. **Processing time calculator** — based on form type + field office; no equivalent anywhere
9. **Document checklist generator** — per immigration category; no equivalent
10. **Schema.org for immigration** — `LegalService` or `GovernmentService` JSON-LD; neither source has it
11. **Legal disclaimer copy** — uscis-helper has `DisclaimerSection.tsx` placeholder but no legal review or content
12. **Locale routing** — uscis-helper has `[locale]` routing + `messages/*.json` scaffolded for en/ru/uk, but messenginfo has 5 locales (en/es/ru/uk/zh); the USCIS-specific translation strings for all 3 locales are empty/placeholder

---

## Section 5 — Recommendations

### Design tokens to use (real values from audited sources)

From `pages.css`:
- Primary CTA: `#ff6b35` → swap to USCIS brand (suggestion: deep navy/blue like `#1a3a6e` or keep orange for urgency CTAs)
- Dark sections (header, footer, hero): `#1a1a2e` + `#16213e` — excellent authoritative feel, keep
- Background: `#f8f9fa` for alternate sections, `#ffffff` for cards
- Border: `#dee2e6`, `border-radius: 12px`, `box-shadow: 0 2px 12px rgba(0,0,0,.08)`
- Typography: Playfair Display for h1/h2 (trust/authority feel) + DM Sans for body (readable, modern)

From `main.css`:
- Warm homepage background `#F5F0E8` with `#2A1F14` text + `#B8892C` gold accent — consider only if USCIS branding allows warm tones; otherwise stick to pages.css palette
- clamp-based font sizes for responsive typography: adopt

### HTML/component patterns worth replicating exactly

1. **Service card grid** (`sp-services-grid` + `sp-service-card`) — the `auto-fill minmax(300px,1fr)` pattern is battle-tested; the hover `translateY(-4px)` + `box-shadow` transition is clean
2. **CTA strip** (`sp-cta-strip`) — full-width colored band with centered h2 + button; extremely effective conversion pattern
3. **Mobile sticky bar** — the 3-button bottom bar injected by JS with `position:fixed;bottom:0` is good UX; adapt for USCIS with Telegram CTA instead of WhatsApp
4. **Deferred tracking script loading** — the `idle(fn, {timeout:3500})` pattern + Consent Mode V2 defaults from `shared.js` should be ported verbatim
5. **Booking form with honeypot** — `.sp-form` structure, honeypot input with `left:-9999px`, phone digit validation, success-state replacement is solid
6. **Schema.org FAQ in JSON-LD** — Handy's pattern of 13 Q&A in `FAQPage` type, embedded in `<head>` — port for USCIS questions
7. **Footer 3-column `auto-fit` grid** — minimal, scalable

### What NOT to copy (anti-patterns found)

1. **MiniWidgets → null** in messenginfo — entire component exists and returns null; dead code; don't repeat this pattern (remove or implement)
2. **33 uncommitted files in messenginfo-merge** — indicates working repo state used as development branch, not a clean reference
3. **Hardcoded i18n inline in HeroSearch.tsx** — translations as a const inside the component file; with 3 locales + next-intl already set up in uscis-helper, use the proper i18n system
4. **main.css vs pages.css split with different token sets** — Handy has two CSS files with different `:root` variables (`--bg/#F5F0E8` in main.css vs `--sp-light/#f8f9fa` in pages.css); creates maintenance confusion; uscis-helper should use one unified token set
5. **`shared.js` WhatsApp attribution-ref API** — tightly coupled to handyman business model; the pattern of firing a server POST before opening external link adds latency; for USCIS, simplify
6. **`?lang=en/es/ru/uk` query param i18n** on Handy homepage (noted in HTML comment: "hreflang removed: ?lang= variants canonical back to /"); uscis-helper already has proper `[locale]` routing, which is the right approach

### Open questions for product owner

1. What is the actual brand color palette for USCIS helper? The current uscis-helper repo has no CSS variables or brand guide.
2. Is messenginfo.com (`uscis-helper`) a rebrand of the existing messenginfo carrier-check domain? The live site currently serves carrier checks at `/en`, `/ru`, `/uk` — is USCIS content going to replace it or be a new subdomain?
3. Are the 6 section components in uscis-helper (`HeroSection`, `ServicesSection`, etc.) intentional placeholders to be filled, or are they from a previous generation and should be replaced?
4. Which USCIS services are in scope for v1? (Family petitions only? Or full catalog including employment, naturalization, DACA?)
5. Is there a legal review requirement before launch? The `DisclaimerSection` exists but has no reviewed legal copy.
6. Auth required? Messenginfo has full next-auth; uscis-helper appears to have no auth scaffolding. Is case tracking feature (which would require auth) in scope?
7. What is the monetization model for USCIS helper? Messenginfo uses Stripe + credits; should uscis-helper be free/freemium/paid?
