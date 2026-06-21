import { describe, it, expect, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FsOcrCacheStore } from '../ocrCacheStore'

const dir = join(tmpdir(), `ocrcache-test-${process.pid}`)
const store = new FsOcrCacheStore(dir)

afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('FsOcrCacheStore — immutable filesystem cache', () => {
  it('returns null on a miss', async () => {
    expect(await store.get('nope')).toBeNull()
  })

  it('stores and reads back an entry', async () => {
    const entry = { key: 'k1', rawResponse: { fields: 1 }, createdAt: 't0' }
    expect(await store.putIfAbsent(entry)).toEqual({ stored: true })
    const got = await store.get('k1')
    expect(got).toMatchObject({ key: 'k1', rawResponse: { fields: 1 } })
  })

  it('is immutable: a second put on the same key does NOT overwrite', async () => {
    await store.putIfAbsent({ key: 'k2', rawResponse: 'first', createdAt: 't1' })
    const r = await store.putIfAbsent({ key: 'k2', rawResponse: 'second', createdAt: 't2' })
    expect(r).toEqual({ stored: false })
    const got = await store.get('k2')
    expect((got as { rawResponse: string }).rawResponse).toBe('first')
  })
})
