# Case Status Checker — exact behavior contract

## Component location
`apps/web/components/home/CaseStatusChecker.tsx`

## Type
Client Component (`'use client'` directive at top).

## Embedding
- On homepage Hero — primary embedding
- On `/[locale]/services/uscis-case-status` page — secondary embedding

## Required HTML

```tsx
<form id="case-status" onSubmit={handleSubmit} className="...">
  <label htmlFor="receipt-input" className="sr-only">Receipt number</label>
  <input
    id="receipt-input"
    type="text"
    autoComplete="off"
    spellCheck={false}
    inputMode="text"
    placeholder={t('placeholder')}
    value={input}
    onChange={(e) => { setInput(e.target.value); setError(null); }}
    aria-invalid={!!error}
    aria-describedby={error ? 'receipt-error' : 'receipt-help'}
  />
  <button type="submit">{t('buttonLabel')}</button>
  {error && <p id="receipt-error" role="alert">{error}</p>}
  <p id="receipt-help">{t('disclaimer')}</p>
</form>
```

## Validation regex (EXACT)

```typescript
const RECEIPT_REGEX = /^(EAC|WAC|LIN|SRC|NBC|MSC|IOE)\d{10}$/
```

These are USCIS service center prefixes:
- EAC: Eastern (Vermont)
- WAC: Western (California)
- LIN: Lincoln (Nebraska)
- SRC: Southern (Texas)
- NBC: National Benefits Center
- MSC: Missouri Service Center
- IOE: USCIS ELIS (electronic, most common today)

## Submit behavior (EXACT)

```typescript
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault()
  const normalized = input.replace(/[\s-]/g, '').toUpperCase()

  if (!RECEIPT_REGEX.test(normalized)) {
    setError(t('errorInvalid'))
    return
  }

  // Open USCIS in new tab WITHOUT the receipt number.
  // We never POST, never store, never include in URL.
  window.open('https://egov.uscis.gov/', '_blank', 'noopener,noreferrer')

  // DO NOT clear input here — let user see what they typed
  // DO NOT call any tracking/analytics with normalized
}
```

## Forbidden

- ❌ `window.open('https://egov.uscis.gov/?receipt=' + normalized, ...)` — NEVER append
- ❌ `fetch('/api/track', { body: { receipt: normalized } })` — NEVER POST
- ❌ `localStorage.setItem('lastReceipt', normalized)` — NEVER store
- ❌ `analytics.track('receipt_submitted', { receipt: normalized })` — NEVER track value
- ❌ `console.log('receipt:', normalized)` — NEVER log

## Allowed analytics

You MAY track that submit happened, without the value:
```typescript
// OK — counts submit attempts, no PII
analytics?.track('case_status_submit', { valid: true })
```

## Accessibility
- `role="alert"` on error message
- `aria-invalid` on input when error present
- `aria-describedby` linking to either help or error text
- `<label>` with `sr-only` if visual label not shown
- Keyboard: Enter submits, Escape clears (optional)

## Visual notes
- Use `rounded-btn` on button, `rounded-card` on container
- Brand-600 for submit button, white text
- Error text: `text-risk-high-fg`
- Help text: `text-ink-500 text-sm`
