/**
 * apps/web/src/lib/security/pii.ts
 *
 * PII scrubber for user-submitted text before logging or AI processing.
 * Detects and replaces sensitive patterns with [REDACTED_*] placeholders.
 *
 * Covered patterns:
 *   - A-Numbers (USCIS alien registration numbers)
 *   - USCIS receipt numbers (IOE, EAC, LIN, SRC, WAC, NBC, MSC, etc.)
 *   - SSN (NNN-NN-NNNN)
 *   - US phone numbers (various formats)
 *   - Email addresses
 */

// ─── Pattern definitions ──────────────────────────────────────────────────────

interface PiiPattern {
  name: string
  regex: RegExp
  placeholder: string
}

const PII_PATTERNS: PiiPattern[] = [
  {
    name: 'A_NUMBER',
    // A-Number: A followed by 8 or 9 digits, case-insensitive, word boundary
    regex: /\b[Aa][-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{3}\b|\b[Aa][-\s]?\d{8,9}\b/g,
    placeholder: '[REDACTED_A_NUMBER]',
  },
  {
    name: 'USCIS_RECEIPT',
    // USCIS receipt numbers: 3-letter prefix + 10 digits
    // Prefixes: IOE, EAC, LIN, SRC, WAC, NBC, MSC, YSC, ZSC, CSC, TSC, VSC
    regex: /\b(?:IOE|EAC|LIN|SRC|WAC|NBC|MSC|YSC|ZSC|CSC|TSC|VSC|IOL)\d{10}\b/gi,
    placeholder: '[REDACTED_RECEIPT_NUMBER]',
  },
  {
    name: 'SSN',
    // SSN: NNN-NN-NNNN (hyphenated only — avoid matching phone extensions)
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    placeholder: '[REDACTED_SSN]',
  },
  {
    name: 'PHONE',
    // US phone numbers in various formats
    // +1 (NNN) NNN-NNNN | (NNN) NNN-NNNN | NNN-NNN-NNNN | NNN.NNN.NNNN
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    placeholder: '[REDACTED_PHONE]',
  },
  {
    name: 'EMAIL',
    // Email addresses
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    placeholder: '[REDACTED_EMAIL]',
  },
]

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scrubs known PII patterns from text.
 * Returns sanitized text with [REDACTED_*] placeholders.
 * Input is not modified — returns a new string.
 */
export function scrubPII(text: string): string {
  if (!text || typeof text !== 'string') return text

  let result = text
  for (const pattern of PII_PATTERNS) {
    // Reset lastIndex in case regex is reused
    pattern.regex.lastIndex = 0
    result = result.replace(pattern.regex, pattern.placeholder)
  }
  return result
}

/**
 * Returns true if the text likely contains sensitive PII.
 * Use to decide whether to flag a message for additional review.
 */
export function hasSensitivePII(text: string): boolean {
  if (!text || typeof text !== 'string') return false

  for (const pattern of PII_PATTERNS) {
    pattern.regex.lastIndex = 0
    if (pattern.regex.test(text)) return true
  }
  return false
}

/**
 * Returns which PII types were detected (for audit logging).
 * Does not return the actual values — only the type names.
 */
export function detectPIITypes(text: string): string[] {
  if (!text || typeof text !== 'string') return []

  const found: string[] = []
  for (const pattern of PII_PATTERNS) {
    pattern.regex.lastIndex = 0
    if (pattern.regex.test(text)) {
      found.push(pattern.name)
    }
  }
  return found
}
