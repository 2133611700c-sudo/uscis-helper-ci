/**
 * Architecture guard (Phase 2 quarantine): the engine-consensus pipeline
 * (`lib/engine/*` + central-brain `analyze()`) was removed because it had zero
 * production callers. This test fails if anything reintroduces a dependency on
 * it, so a future change can't silently grow a second extraction "brain" again.
 *
 * The live document pipeline is lib/docintel + lib/canonical/core (arbitration).
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC = resolve(__dirname, '../../..') // apps/web/src

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      out.push(...walk(p))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(p)
    }
  }
  return out
}

describe('architecture guard — no engine / analyze revival', () => {
  it('lib/engine/ no longer exists', () => {
    expect(existsSync(join(SRC, 'lib', 'engine'))).toBe(false)
  })

  it('no source file imports from lib/engine or imports analyze from central-brain', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8')
      if (/from\s+['"][^'"]*\/engine(\/|['"])/.test(text)) offenders.push(`${file} → imports lib/engine`)
      if (/\banalyze\b[^\n]*from\s+['"][^'"]*central-brain/.test(text)) offenders.push(`${file} → imports analyze from central-brain`)
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('central-brain only exports brainHealth (no analyze)', () => {
    const idx = readFileSync(join(SRC, 'lib', 'central-brain', 'index.ts'), 'utf8')
    expect(idx).not.toMatch(/export\s+(async\s+)?function\s+analyze/)
    expect(idx).toMatch(/brainHealth/)
  })
})
