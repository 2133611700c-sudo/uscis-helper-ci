/**
 * Prompt injection guard for the Mia AI agent.
 *
 * Detects patterns that attempt to:
 *  - Override or ignore system instructions
 *  - Switch the assistant's role/identity
 *  - Extract system prompt or internal instructions
 *  - Jailbreak the model (DAN, developer mode, etc.)
 *  - Inject structured instructions via formatting hacks
 *
 * Used in POST /api/mia/chat before the message is forwarded to the AI.
 */

interface InjectionPattern {
  pattern: RegExp
  label: string
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  // ── Role override ─────────────────────────────────────────────────────────
  {
    pattern: /ignore\s+(all\s+)?(previous|prior|above|system|original)\s+instructions?/i,
    label: 'role_override',
  },
  {
    pattern: /forget\s+(everything|all\s+instructions?|prior|previous|your\s+instructions?)/i,
    label: 'role_override',
  },
  {
    pattern: /disregard\s+(all\s+)?(previous|prior|system|above)\s+instructions?/i,
    label: 'role_override',
  },
  {
    pattern: /from\s+now\s+on\s+(you\s+)?(will|must|should|are)\s+/i,
    label: 'role_override',
  },
  {
    pattern: /your\s+(new\s+)?instructions?\s+(are|is)\s+/i,
    label: 'role_override',
  },

  // ── Identity / role switch ────────────────────────────────────────────────
  {
    pattern: /you\s+are\s+now\s+(a|an)\s+/i,
    label: 'role_switch',
  },
  {
    pattern: /act\s+as\s+(a|an)?\s*(different|new|evil|unrestricted|admin|system|hacker|gpt)/i,
    label: 'role_switch',
  },
  {
    pattern: /pretend\s+(you\s+are|to\s+be)\s+(a|an)\s+/i,
    label: 'role_switch',
  },
  {
    pattern: /you\s+are\s+no\s+longer\s+/i,
    label: 'role_switch',
  },
  {
    pattern: /roleplay\s+as\s+(a|an)\s+/i,
    label: 'role_switch',
  },

  // ── System prompt extraction ──────────────────────────────────────────────
  {
    pattern: /print\s+(your\s+)?(system\s+prompt|instructions?|initial\s+prompt)/i,
    label: 'extraction',
  },
  {
    pattern: /reveal\s+(your\s+)?(system\s+prompt|instructions?|initial\s+prompt|context)/i,
    label: 'extraction',
  },
  {
    pattern: /show\s+(me\s+)?(your\s+)?(system\s+prompt|hidden\s+instructions?|base\s+prompt)/i,
    label: 'extraction',
  },
  {
    pattern: /what\s+(is|are|were)\s+your\s+(system\s+)?instructions?/i,
    label: 'extraction',
  },
  {
    pattern: /repeat\s+(your\s+)?(system\s+prompt|original\s+instructions?)/i,
    label: 'extraction',
  },

  // ── Jailbreak keywords ────────────────────────────────────────────────────
  {
    pattern: /\bDAN\b.*mode/i,
    label: 'jailbreak',
  },
  {
    pattern: /jailbreak/i,
    label: 'jailbreak',
  },
  {
    pattern: /developer\s+mode/i,
    label: 'jailbreak',
  },
  {
    pattern: /bypass\s+(your\s+)?(filter|restriction|safety|limit|guard)/i,
    label: 'jailbreak',
  },
  {
    pattern: /no\s+(restrictions?|limits?|rules?|filters?|safety)/i,
    label: 'jailbreak',
  },

  // ── Format / markup injection ─────────────────────────────────────────────
  {
    pattern: /\[system\s*:/i,
    label: 'format_injection',
  },
  {
    pattern: /<\/?system>/i,
    label: 'format_injection',
  },
  {
    pattern: /###\s*system\s*:/i,
    label: 'format_injection',
  },
  {
    pattern: /```\s*system/i,
    label: 'format_injection',
  },
  {
    pattern: /\[INST\]/i,  // Llama instruction format injection
    label: 'format_injection',
  },
]

export interface GuardResult {
  safe: boolean
  label?: string
}

/**
 * Check a user message for prompt injection patterns.
 * Returns { safe: true } if clean, or { safe: false, label } if suspicious.
 */
export function checkPromptInjection(text: string): GuardResult {
  for (const { pattern, label } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, label }
    }
  }
  return { safe: true }
}
