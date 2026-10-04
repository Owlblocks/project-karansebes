import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { db } from '../db/database'
import { bucket } from '../test/fakeS3'
import { clearTables, makeImage, seed, SETTLE_MS, sleep, useLocalMode, useS3Mode } from '../test/helpers'
import type { Manifest } from './manifest'
import { syncManifestNow, withSyncSuppressed } from './manifestSync'

vi.mock('./s3', () => import('../test/fakeS3'))

const DEBOUNCE_MS = 700

let consoleError: MockInstance

beforeEach(async () => {
  useS3Mode()
  bucket.reset()
  await clearTables()
  await seed({
    sourceWorks: [{ id: 'sw1', name: 'Work One' }],
    characters: [{ id: 'c1', name: 'Alice', sourceWorkIds: ['sw1'] }],
    images: [makeImage({ contentHash: 'img1', characterIds: ['c1'], sourceWorkIds: ['sw1'] })],
  })
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  // Let any trailing re-sync finish so it can't land in the next test's bucket.
  await sleep(SETTLE_MS)
  await vi.waitFor(() => expect(bucket.inFlight).toBe(0))
  // flush() only logs failures, so this is where a failed sync surfaces.
  expect(consoleError).not.toHaveBeenCalled()
})

const writes: { name: string; write: () => Promise<unknown>; check: (m: Manifest) => void }[] = [
  {
    name: 'adding an image',
    write: () => db.images.add(makeImage({ contentHash: 'img2' })),
    check: m => expect(m.images.map(i => i.contentHash)).toContain('img2'),
  },
  {
    name: 'retagging an image',
    write: () => db.images.update('img1', { situationTags: ['smug'] }),
    check: m => expect(m.images[0].situationTags).toEqual(['smug']),
  },
  {
    name: 'deleting an image',
    write: () => db.images.delete('img1'),
    check: m => expect(m.images).toEqual([]),
  },
  {
    name: 'adding a character',
    write: () => db.characters.add({ id: 'c2', name: 'Bob', sourceWorkIds: [] }),
    check: m => expect(m.characters.map(c => c.id)).toContain('c2'),
  },
  {
    name: 'renaming a character',
    write: () => db.characters.update('c1', { name: 'Alicia' }),
    check: m => expect(m.characters[0].name).toBe('Alicia'),
  },
  {
    name: 'deleting a character',
    write: () => db.characters.delete('c1'),
    check: m => expect(m.characters).toEqual([]),
  },
  {
    name: 'adding a source work',
    write: () => db.sourceWorks.add({ id: 'sw2', name: 'Work Two' }),
    check: m => expect(m.sourceWorks.map(s => s.id)).toContain('sw2'),
  },
  {
    name: 'renaming a source work',
    write: () => db.sourceWorks.update('sw1', { name: 'Work Uno' }),
    check: m => expect(m.sourceWorks[0].name).toBe('Work Uno'),
  },
  {
    name: 'deleting a source work',
    write: () => db.sourceWorks.delete('sw1'),
    check: m => expect(m.sourceWorks).toEqual([]),
  },
  {
    name: 'a transaction spanning two tables',
    write: () =>
      db.transaction('rw', db.characters, db.images, async () => {
        await db.characters.delete('c1')
        await db.images.update('img1', { characterIds: [] })
      }),
    check: m => {
      expect(m.characters).toEqual([])
      expect(m.images[0].characterIds).toEqual([])
    },
  },
]

// Each of these runs the real Dexie hooks against IndexedDB. Writes that only
// touch one table are the regression case for building the manifest inside the
// write's own (single-table) transaction, which failed with NotFoundError.
describe('every kind of write uploads a fresh manifest', () => {
  it.each(writes)('$name', async ({ write, check }) => {
    await write()
    await vi.waitFor(() => {
      expect(bucket.manifest).not.toBeNull()
      check(bucket.manifest!)
    })
  })
})

describe('when an upload happens', () => {
  it('syncManifestNow uploads the full current state, minus thumbnails', async () => {
    syncManifestNow(db)
    await vi.waitFor(() => expect(bucket.puts).toHaveLength(1))
    const m = bucket.puts[0]
    expect(m.version).toBe(1)
    expect(m.sourceWorks).toEqual([{ id: 'sw1', name: 'Work One' }])
    expect(m.characters).toEqual([{ id: 'c1', name: 'Alice', sourceWorkIds: ['sw1'] }])
    expect(m.images).toHaveLength(1)
    expect(m.images[0]).not.toHaveProperty('thumbnailDataUrl')
    expect(m.images[0].createdAt).toBe('2026-01-02T03:04:05.000Z')
  })

  it('skips updates that only change the thumbnail', async () => {
    await db.images.update('img1', { thumbnailDataUrl: 'data:image/png;base64,BBBB' })
    await sleep(SETTLE_MS)
    expect(bucket.puts).toHaveLength(0)
  })

  it('debounces text-only edits', async () => {
    await db.images.update('img1', { notes: 'draft' })
    await sleep(DEBOUNCE_MS / 2)
    expect(bucket.puts).toHaveLength(0)
    await vi.waitFor(() => expect(bucket.puts).toHaveLength(1), { timeout: DEBOUNCE_MS * 2 })
    expect(bucket.puts[0].images[0].notes).toBe('draft')
  })

  it('collapses a burst of text edits into one upload of the final text', async () => {
    for (const text of ['a', 'ab', 'abc']) {
      await db.images.update('img1', { imageText: text })
    }
    await sleep(DEBOUNCE_MS + 300)
    expect(bucket.puts).toHaveLength(1)
    expect(bucket.puts[0].images[0].imageText).toBe('abc')
  })

  it('uploads at once when a structural edit follows a text edit, with no trailing duplicate', async () => {
    await db.images.update('img1', { notes: 'draft' })
    await db.images.update('img1', { situationTags: ['smug'] })
    await vi.waitFor(() => expect(bucket.puts).toHaveLength(1), { timeout: DEBOUNCE_MS - 200 })
    expect(bucket.puts[0].images[0]).toMatchObject({ notes: 'draft', situationTags: ['smug'] })
    await sleep(DEBOUNCE_MS + 200)
    expect(bucket.puts).toHaveLength(1)
  })

  it('does nothing in local mode', async () => {
    useLocalMode()
    await db.images.delete('img1')
    await sleep(SETTLE_MS)
    expect(bucket.puts).toHaveLength(0)
  })

  it('does nothing while suppressed, and resumes afterwards', async () => {
    await withSyncSuppressed(async () => {
      await db.images.add(makeImage({ contentHash: 'img2' }))
    })
    await sleep(SETTLE_MS)
    expect(bucket.puts).toHaveLength(0)

    await db.images.delete('img2')
    await vi.waitFor(() => expect(bucket.puts).toHaveLength(1))
  })

  it('resumes after a suppressed operation throws', async () => {
    await expect(withSyncSuppressed(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await db.images.delete('img1')
    await vi.waitFor(() => expect(bucket.puts).toHaveLength(1))
  })
})

describe('upload single-flighting', () => {
  it('never overlaps uploads, and the last one carries every change', async () => {
    bucket.holdPuts = true
    await db.images.add(makeImage({ contentHash: 'a' }))
    await vi.waitFor(() => expect(bucket.pending).toHaveLength(1))

    // Changes made while the first upload is still pending.
    await db.images.add(makeImage({ contentHash: 'b' }))
    await db.images.add(makeImage({ contentHash: 'c' }))
    await sleep(SETTLE_MS)
    expect(bucket.puts).toHaveLength(1)

    bucket.pending[0].resolve()
    await vi.waitFor(() => expect(bucket.pending).toHaveLength(2))
    bucket.pending[1].resolve()
    await vi.waitFor(() => expect(bucket.inFlight).toBe(0))

    expect(bucket.puts).toHaveLength(2)
    expect(bucket.maxInFlight).toBe(1)
    expect(bucket.manifest!.images.map(i => i.contentHash).sort()).toEqual(['a', 'b', 'c', 'img1'])
  })

  it('still runs the queued re-sync when the in-flight upload fails', async () => {
    bucket.holdPuts = true
    await db.images.add(makeImage({ contentHash: 'a' }))
    await vi.waitFor(() => expect(bucket.pending).toHaveLength(1))
    await db.images.add(makeImage({ contentHash: 'b' }))

    bucket.pending[0].reject(new Error('network down'))
    await vi.waitFor(() => expect(bucket.pending).toHaveLength(2))
    bucket.pending[1].resolve()
    await vi.waitFor(() => expect(bucket.inFlight).toBe(0))

    expect(bucket.manifest!.images.map(i => i.contentHash).sort()).toEqual(['a', 'b', 'img1'])
    expect(consoleError).toHaveBeenCalledWith('Failed to sync manifest to S3:', expect.any(Error))
    consoleError.mockClear()
  })
})
