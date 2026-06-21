/**
 * TPS accessibility floor — explicit constants for 30-80-year-old users.
 *
 * Our real audience is Ukrainian refugees aged 30-80 filing TPS, many on
 * basic Android devices, many with age-related vision difficulties. WCAG
 * 2.1 AA recommends 16px body; we make 14px the absolute floor and never
 * go below it for ANY user-facing text, with bumped font-weight on
 * smaller text for legibility.
 *
 * Rule of thumb when picking a size:
 *   - Primary action labels, generated values: 16-18px, weight 700+
 *   - Body text, hints: 15-16px, weight 400-500
 *   - Field labels, secondary info: 14px, weight 600-700
 *   - Disclaimers ("not a law firm"), source citations: 14px, weight 500,
 *     readable contrast (not text-3 grey)
 *   - Microcopy that MUST stay tiny (timestamp on success row): 13px,
 *     weight 500, color text-2 not text-3
 *
 * Touch targets: 44px is the iOS Human Interface Guidelines floor and
 * is also the Material Design accessibility recommendation. We aim for
 * 48px on primary CTAs.
 *
 * Import these constants from this module so every TPS surface stays
 * aligned and the audit doesn't drift again.
 */

export const TPS_A11Y = {
  // Font sizes (numeric — fed into inline style fontSize)
  TEXT_PRIMARY_VALUE: 18,          // the "Shevchenko" final-value chip
  TEXT_BODY: 16,                   // paragraph body in cards/modals
  TEXT_BODY_COMPACT: 15,           // body in compact rows
  TEXT_LABEL: 14,                  // field labels, sub-headers
  TEXT_DISCLAIMER: 14,             // 'Messenginfo is not a law firm'
  TEXT_HINT: 14,                   // helper text under inputs
  TEXT_META: 13,                   // confidence badge, timestamp
  TEXT_TINY_FLOOR: 13,             // ABSOLUTE FLOOR — nothing below this

  // Font weights
  WEIGHT_NORMAL: 400,
  WEIGHT_MEDIUM: 500,              // small but readable
  WEIGHT_SEMIBOLD: 600,
  WEIGHT_BOLD: 700,
  WEIGHT_HEAVY: 800,

  // Line heights
  LINE_HEIGHT_BODY: 1.55,          // older eyes benefit from extra leading
  LINE_HEIGHT_COMPACT: 1.45,
  LINE_HEIGHT_DENSE: 1.3,

  // Touch targets
  TOUCH_MIN: 44,                   // floor (iOS HIG, WCAG 2.5.5)
  TOUCH_PRIMARY: 48,               // primary CTAs
  TOUCH_GENEROUS: 52,              // when space allows

  // Color tokens to AVOID for small text (they have insufficient contrast
  // against typical surfaces for elder users):
  //   var(--text-3)  on  var(--surface-2)   — fails AA at <14px
  //   var(--text-3)  on  var(--warning-bg)  — illegible amber on amber
  // Use var(--text-2) instead for anything ≤14px.
} as const

export type TPSA11Y = typeof TPS_A11Y
