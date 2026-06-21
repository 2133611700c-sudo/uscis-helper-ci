/**
 * ocrCacheStore — filesystem-backed, IMMUTABLE OcrCacheStore for V1 benchmarks.
 *
 * Server-only. Stores cached raw provider responses in a PRIVATE staging/local
 * directory (must be gitignored — never commit originals or raw responses).
 * Immutability: putIfAbsent uses the 'wx' open flag, so an existing key is never
 * overwritten. The on-disk filename is sha256(key) so any key string is safe;
 * the original key is stored inside the entry.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { OcrCacheStore, OcrCacheEntry } from './ocrCache'

export class FsOcrCacheStore implements OcrCacheStore {
  /** dir MUST be a private, gitignored path (e.g. a staging cache volume). */
  constructor(private readonly dir: string) {}

  private fileFor(key: string): string {
    return join(this.dir, createHash('sha256').update(key).digest('hex') + '.json')
  }

  async get(key: string): Promise<OcrCacheEntry | null> {
    try {
      const raw = await fs.readFile(this.fileFor(key), 'utf8')
      return JSON.parse(raw) as OcrCacheEntry
    } catch {
      return null // miss (or unreadable) → treat as miss; caller decides under budget
    }
  }

  /** Immutable write: returns {stored:false} if the key already exists. */
  async putIfAbsent(entry: OcrCacheEntry): Promise<{ stored: boolean }> {
    await fs.mkdir(this.dir, { recursive: true })
    try {
      await fs.writeFile(this.fileFor(entry.key), JSON.stringify(entry), { flag: 'wx' })
      return { stored: true }
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'EEXIST') return { stored: false }
      throw e
    }
  }
}
