# Service Card Images Integration Report
Generated: 2026-05-01
Task: TASK-CARD-IMAGES
Status: COMPLETE

---

## Summary

5 professional images integrated into Messenginfo service cards. Cards now render with a full-width image header, "Official source" overlay badge, and hover zoom effect — consistent with the Handy & Friend card style pattern. 7 remaining cards retain icon-only fallback design (by spec or missing source image).

---

## Files Changed

### New directory: `apps/web/public/service-icons/`

| File | Source UUID | Dimensions | Size |
|---|---|---|---|
| `tps-ukraine.png` | F42FEE02-CAC8-4078-9C9B-7F42088A4E10 3 2 | 1672×941 | 2.4 MB |
| `work-permit.png` | 02D68235-... | 1672×941 | 2.5 MB |
| `i-94.png` | 7A45694E-... | 1672×941 | 2.7 MB |
| `biometrics.png` | 24AD358B-... | 1672×941 | 2.5 MB |
| `translate-document.png` | 2D22BA2E-... | 1672×941 | 2.5 MB |

### Modified: `apps/web/src/data/serviceCards.ts`

Added `image?: string` optional field to `ServiceCard` interface. Updated 5 service card entries:

```typescript
export interface ServiceCard {
  id: string
  slug: string
  icon: LucideIcon
  image?: string           // NEW — optional hero image path
  risk: RiskLevel
  hasOfficialSource: boolean
  officialSourceUrl: string
  sourceLastVerified: string
  sortOrder: number
}
```

Cards with image field added:
- `tps-ukraine` → `/service-icons/tps-ukraine.png`
- `ead-work-permit` → `/service-icons/work-permit.png`
- `i-94` → `/service-icons/i-94.png`
- `biometrics` → `/service-icons/biometrics.png`
- `translate-document` → `/service-icons/translate-document.png`

### Modified: `apps/web/src/components/cards/ServiceCard.tsx`

Complete rewrite to handle both image and icon-only variants:

**Image cards:**
- Fixed-height image container: `h-[150px] sm:h-[160px]` with `relative` + `fill` Next.js Image
- `object-cover object-center` for consistent cropping of landscape images
- `overflow-hidden` on card root preserves `rounded-[12px]` border radius
- Official source badge overlaid bottom-left: `bg-white/90 backdrop-blur-sm text-brand-700`
- Hover scale on image: `group-hover:scale-[1.03]` with `duration-300` transition
- Reduced padding on content area: `p-4 md:p-5` vs `p-5 md:p-6` for icon cards

**Icon-only cards (unchanged UX):**
- Min-height preserved: `min-h-[176px] md:min-h-[200px]`
- IconBadge + Official source badge in header row
- Full padding: `p-5 md:p-6`

---

## Service Cards — Final State

| Card | Has Image | Image File | Status |
|---|---|---|---|
| parole-expires-soon | No | — | Icon-only (intentional — abstract concept) |
| re-parole-u4u | No | — | Icon-only (intentional — abstract concept) |
| tps-ukraine | ✅ Yes | tps-ukraine.png | Ukrainian flag + capitol scene |
| ead-work-permit | ✅ Yes | work-permit.png | EAD Guide + Employment Authorization visual |
| i-94 | ✅ Yes | i-94.png | Arrival/Departure record + boarding pass |
| uscis-case-status | No | — | Icon-only (no suitable image) |
| payment-problem | No | — | Icon-only (no suitable image) |
| biometrics | ✅ Yes | biometrics.png | Biometrics appointment form + fingerprints |
| rfe-denial | No | — | Icon-only (abstract concept) |
| translate-document | ✅ Yes | translate-document.png | Translation guide + official seals |
| form-draft-helper | No | — | Icon-only (source image not found in Downloads) |
| official-sources | No | — | Icon-only (abstract concept) |

---

## Design Decisions

**Image height fixed at 150–160px (not full card):** Landscape 16:9 images at 1672×941 would dominate vertical space at full width. Fixed container + `object-cover` extracts the visually strongest center crop. Consistent grid height regardless of content length.

**Official source badge position:** On image cards, badge moves to image overlay (bottom-left, white with backdrop blur) to maintain visual hierarchy. On icon cards it stays in the top-right header as before.

**No image for form-draft-helper:** No matching image was found in the user's Downloads folder during the task. Card remains icon-only — this is a valid fallback. Can be added later if a matching image is supplied.

**tps-ukraine added mid-task:** User provided the TPS image (F42FEE02 3 2) while the integration was already in progress. Added without interrupting the build pipeline. TypeScript typecheck and Next.js build both passed after the addition.

---

## Build Verification

```
pnpm --filter web build
✓ TypeScript check — 0 errors
✓ Next.js build — compiled successfully
✓ All 12 service card routes static-generated
```

---

## Visual Verification

**Desktop (1440×900):** Service card grid showing correct 2-column layout. TPS Ukraine, EAD Work Permit, I-94, Biometrics, Translate Document cards all rendering with image headers. Official source overlay badges visible bottom-left on each. Hover zoom effect active.

**Mobile (390×844):** Single-column card layout. EAD Work Permit and I-94 cards confirmed rendering with full-width image headers at `h-[150px]`. Official source badges correctly positioned. Mobile bottom bar (Services/Status/Contact/Home) intact.

---

## Gaps / Future Work

| Item | Priority | Notes |
|---|---|---|
| form-draft-helper image | P2 | Source image not found. Supply PNG → add to service-icons/ → add image field to data |
| parole-expires-soon image | P3 | Abstract concept — may not benefit from photo |
| re-parole-u4u image | P3 | Abstract concept — may not benefit from photo |
| Image optimization | P2 | Source files are 2.4–2.7 MB each. Consider running through squoosh/imagemin to compress to <500KB per image without visual loss. Next.js Image handles runtime optimization but smaller source = faster builds. |

---

*Report written by Claude Code. All integration done in-session. No external dependencies added.*
