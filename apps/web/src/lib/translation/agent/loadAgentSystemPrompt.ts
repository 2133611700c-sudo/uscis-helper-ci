/**
 * Master Agent System Prompt loader — v5 §34.
 *
 * Loads `prompts/translation-agent-system.md` as a string so future
 * extraction-prompt builders can prepend it as the system message.
 *
 * IMPORTANT — passport-runtime safety:
 *   This helper exists so future modules can use the master prompt.
 *   It is NOT wired into the active passport extraction prompt today.
 *   The passport extraction baseline must NOT change as a side effect of
 *   this commit. See task spec
 *     CLOSE_REMAINING_V5_PLAN_ITEMS_LOW_RISK
 *     decision_locked.master_agent_system_prompt = "4B_HELPER_ONLY..."
 *
 * Safety properties:
 *   - never throws — returns null on missing file or read error
 *   - synchronous read so callers don't have to await
 *   - cached after first successful load (idempotent)
 */
import fs from 'node:fs'
import path from 'node:path'

const PROMPT_FILE_RELATIVE = 'prompts/translation-agent-system.md'

let cached: string | null | undefined = undefined

/**
 * Load the master agent system prompt. Returns null when the file is
 * missing or unreadable. Never throws.
 *
 * Test seam: the test suite passes an explicit `repoRoot` so the helper
 * can be exercised against the real file regardless of cwd.
 */
export function loadAgentSystemPrompt(repoRoot?: string): string | null {
  if (cached !== undefined && !repoRoot) return cached

  // Default repo root: walk up from this file until we find prompts/ or the
  // git root. This file lives at:
  //   apps/web/src/lib/translation/agent/loadAgentSystemPrompt.ts
  // so the repo root is 6 levels up.
  const root = repoRoot ?? path.resolve(__dirname, '../../../../../..')
  const fullPath = path.join(root, PROMPT_FILE_RELATIVE)

  try {
    if (!fs.existsSync(fullPath)) {
      if (!repoRoot) cached = null
      return null
    }
    const text = fs.readFileSync(fullPath, 'utf-8')
    if (!text || !text.trim()) {
      if (!repoRoot) cached = null
      return null
    }
    if (!repoRoot) cached = text
    return text
  } catch {
    // ENOENT / EACCES / read error — caller falls back to per-module prompt only.
    if (!repoRoot) cached = null
    return null
  }
}

/**
 * Clear the in-memory cache. Test-only utility. Production callers MUST NOT
 * call this — the prompt does not change at runtime in production.
 */
export function __resetAgentPromptCacheForTests(): void {
  cached = undefined
}

/**
 * Build a system message header for future module extraction prompts.
 * Returns an empty string when the master prompt is not available.
 *
 * NOT used by the active passport extraction prompt today. Future
 * modules can call this and prepend the result to their per-module
 * extraction prompt.
 */
export function buildSystemMessageHeader(repoRoot?: string): string {
  const text = loadAgentSystemPrompt(repoRoot)
  if (!text) return ''
  // Wrap in a labelled block so it's identifiable in DeepSeek logs and
  // doesn't bleed into per-module instructions. Trailing newline ensures
  // the per-module prompt sits cleanly on its own line.
  return [
    '/* SYSTEM_PROMPT_BEGIN — translation-agent-system.md */',
    text.trim(),
    '/* SYSTEM_PROMPT_END */',
    '',
  ].join('\n')
}
