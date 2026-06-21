/**
 * Phase 0 multi-service wizard refactor — pure storage-key helper.
 *
 * Extracted from WizardContext.tsx so unit tests can import it without
 * loading React or any JSX-aware transformer.
 *
 *   wizard:re-parole-u4u:state   ← Re-Parole U4U
 *   wizard:tps-ukraine:state     ← TPS Ukraine
 *
 * Re-exported from WizardContext.tsx for callers that already import from
 * there.
 */

export function buildLocalStorageKey(serviceSlug: string): string {
  return `wizard:${serviceSlug}:state`
}
