# Mobile Bottom Bar — component spec

## Component location
`apps/web/components/layout/MobileBottomBar.tsx`

## Visibility
- Visible on mobile only (< 768px)
- Hidden on `md:` and above
- Use Tailwind: `md:hidden` on the root element

## Required marker (for verification)

```tsx
<nav data-mobile-bar="true" className="...">
```

The `data-mobile-bar="true"` attribute is required so the verification curl check can find it.

## Position

```tsx
<nav
  data-mobile-bar="true"
  className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-slate-200 md:hidden pb-[env(safe-area-inset-bottom)]"
>
```

## 4 buttons (in order)

```tsx
const items = [
  { href: `/${locale}`,           label: t('home'),     icon: Home },
  { href: `/${locale}/services`,  label: t('services'), icon: Grid3x3 },
  { href: `/${locale}#case-status`, label: t('status'), icon: Search },
  { href: `/${locale}/contact`,   label: t('contact'),  icon: Mail },
]
```

Use `lucide-react` icons: `Home`, `Grid3x3`, `Search`, `Mail`.

## Per-item layout

```tsx
<Link
  href={item.href}
  className="flex flex-col items-center justify-center gap-1 py-2 px-3 text-ink-500 hover:text-brand-600 active:text-brand-700"
>
  <Icon className="w-5 h-5" />
  <span className="text-xs">{item.label}</span>
</Link>
```

## Active state

If current route matches `item.href`, apply `text-brand-600`.

## Body padding compensation

Add `pb-16 md:pb-0` to the root layout `<main>` so content isn't hidden under the bar on mobile.

## Required props

None. Component is self-contained, reads locale from `useLocale()` and translations from `useTranslations('mobileBar')`.

## Hidden when

- Print mode (`@media print { display: none }`)
- Inside Mia widget panel (handled by widget z-index, not by this component)

## Forbidden

- ❌ Don't make it sticky-bottom only on scroll — it's always-visible fixed
- ❌ Don't add more than 4 buttons — UX overload
- ❌ Don't include "Cart" or "Account" — those are Wave 3
- ❌ Don't include language switcher here — that's in Header
