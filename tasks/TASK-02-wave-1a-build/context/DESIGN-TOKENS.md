# DESIGN TOKENS — Tailwind extend

Add to `apps/web/tailwind.config.ts` `theme.extend`:

```typescript
colors: {
  brand: {
    50:  '#eef2ff',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    900: '#312e81',
  },
  ink: {
    900: '#0f172a',
    700: '#334155',
    600: '#475569',
    500: '#64748b',
  },
  risk: {
    'low-bg':  '#d1fae5', 'low-fg':  '#047857',
    'mid-bg':  '#fef3c7', 'mid-fg':  '#b45309',
    'high-bg': '#fee2e2', 'high-fg': '#b91c1c',
  },
},
borderRadius: {
  'card':  '1rem',     // 16px — between Handy 12px and premium 20px
  'btn':   '0.625rem', // 10px
  'badge': '9999px',
},
boxShadow: {
  'card':       '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 12px rgb(0 0 0 / 0.06)',
  'card-hover': '0 4px 8px rgb(0 0 0 / 0.06), 0 12px 32px rgb(0 0 0 / 0.10)',
},
maxWidth: {
  'content': '1200px',
},
```

## Usage rules

**Brand** (indigo family) — primary CTA, hero accent, header nav active state, link color
**Ink** — body text (`ink-700`), subdued text (`ink-500`), headings (`ink-900`)
**Risk** — only on RiskBadge component on service cards
- `risk-low-*` for low-risk topics (case status, biometrics, I-94, translate-document, official-sources)
- `risk-mid-*` for medium-risk (TPS, EAD, payment-problem, biometrics, form-draft-helper)
- `risk-high-*` for high-risk (parole-expires-soon, re-parole-u4u, rfe-denial)

**Card radius**: 16px (`rounded-card`) — every card on the site
**Button radius**: 10px (`rounded-btn`) — all buttons
**Container**: `max-w-content mx-auto px-4 sm:px-6 lg:px-8` — every section

## Typography

Use Tailwind defaults. Sans: Inter (already in Next.js font config) or system fallback. Do NOT add new font families.

Heading sizes:
- H1: `text-4xl md:text-5xl font-bold tracking-tight text-ink-900`
- H2: `text-2xl md:text-3xl font-semibold text-ink-900`
- H3: `text-lg md:text-xl font-semibold text-ink-900`
- Body: `text-base text-ink-700`
- Small: `text-sm text-ink-500`

## Spacing

Section vertical: `py-12 md:py-16 lg:py-20`
Card padding: `p-6` (small cards) or `p-8` (large cards)
Grid gap: `gap-6` (mobile) → `gap-8` (desktop)

## Mobile breakpoints

- Mobile: default (< 640px)
- Tablet: `md:` (≥ 768px)
- Desktop: `lg:` (≥ 1024px)
- Wide: `xl:` (≥ 1280px)

## Mobile bottom bar safe area

```css
padding-bottom: env(safe-area-inset-bottom);
```

Use Tailwind arbitrary value: `pb-[env(safe-area-inset-bottom)]`
