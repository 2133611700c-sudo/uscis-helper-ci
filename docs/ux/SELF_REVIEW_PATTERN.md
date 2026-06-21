# Self-Review UI Pattern — locked rule

**Status:** product-wide rule for any screen where the user reviews
AI-extracted or AI-prefilled data before continuing.

**Owner decision:** Taras, 2026-05-11.

---

## The rule

One action button per row: **«Изменить»** (Edit).
At the bottom: **«Назад»** and **«Дальше»**.
Pressing **«Дальше»** means **«я принял все значения, как они показаны
сейчас»** (I accept everything currently shown).

## What NOT to do

These patterns are FORBIDDEN on review screens:

- `[Верно] [Неверно]` per row
- `[Подтвердить] [Исправить]` per row
- Per-field confirmation checklist
- Big red "Review required" wording
- Any UX that feels like an exam
- Any per-field "accept" toggle the user must click before continuing

These all add cognitive load. For our audience (30–80 years old,
limited English, mobile-first) the exam feel raises anxiety and
increases drop-off.

## Concrete examples

### Normal field (high confidence)

```
Фамилия: Kovalenko                  [Изменить]
Имя: Ivan                           [Изменить]
Дата рождения: 07/12/1985           [Изменить]
Номер паспорта: FA1234567           [Изменить]
```

### Field is missing (OCR couldn't read it)

```
Номер паспорта: не найден           [Ввести]
```

The button label changes from «Изменить» to «Ввести» because there's
nothing to edit yet. Functionally identical otherwise.

### Field has low OCR confidence

```
Дата въезда: 10/05/2023   плохо видно   [Изменить]
```

A subtle warning is shown but the row still has a single button.
The word "Изменить" (not "Подтвердить") keeps the user out of
exam mode.

## When «Дальше» can still be blocked

Even though "Дальше = accept-all", we still block forward navigation
in two cases:

1. **A critical required field is empty.** Show: "Пожалуйста, введите
   номер паспорта." → highlight the row with a single «Ввести» button.

2. **A critical field has low OCR confidence AND was never opened by
   the user.** Show: "Проверьте подсвеченные строки и нажмите
   «Изменить» если нужно поправить, или «Подтверждаю» если
   правильно." — this is the ONLY case where a per-field "Подтверждаю"
   appears, and only after a soft prompt.

Critical fields = `family_name`, `given_name`, `dob`, `passport_number`,
`last_entry_date`. Non-critical fields never block "Дальше".

## Page-level help text (above the rows)

```
Проверьте данные.
Если всё правильно — нажмите «Дальше».
Если нужно поправить строку — нажмите «Изменить».
```

Three lines, plain language, no jargon.

## Grouping

When there are many rows, group them:

1. **«Важные данные для формы»** (the ~6 critical fields at the top)
2. **«Дополнительные данные»** (the rest, collapsed under a toggle so
   the screen doesn't feel overwhelming)

The first group must fit on a single mobile screen without scrolling
past the «Дальше» button.

## Implementation

When we build the OCR review screen in SPRINT-OCR, the component
must export this contract:

```ts
interface SelfReviewProps {
  rows: Array<{
    label: string                          // "Фамилия"
    value: string                          // current value (may be empty)
    confidenceLow?: boolean                // show subtle warning
    confidenceLabel?: string               // e.g. "плохо видно"
    actionLabel: 'Изменить' | 'Ввести'      // computed: empty → Ввести
    critical: boolean                      // affects "Дальше" gate
    onEdit: () => void
  }>
  onBack: () => void
  onNext: () => void
  nextDisabledReason?: string              // shown above buttons
}
```

No more props, no per-row Confirm callback, no boolean array of
"accepted" flags.

## Why this matters

- fewer buttons → less anxiety
- "Дальше" carries weight → user already understands accept-everything
- no exam vibe → suitable for 60–80 year-old audience
- reduces accidental mis-taps on small mobile targets

## Where this rule applies

- TPS OCR review screen (SPRINT-OCR)
- Translation Engine review screen (already similar; align)
- Re-Parole document confirmation
- Any future service that uses AI-extracted data

## Where this rule does NOT apply

- USCIS form signature lines — those need physical pen on paper, not UI.
- Payment confirmation — Stripe handles its own flow.
- Legal terms acceptance — that genuinely needs an explicit checkbox
  for legal reasons.
