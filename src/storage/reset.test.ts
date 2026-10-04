import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { bucket } from '../test/fakeS3'
import { clearTables, makeImage, seed, SETTLE_MS, sleep, useS3Mode } from '../test/helpers'
import { maybeRestoreFromS3 } from './autoRestore'
import { syncManifestNow } from './manifestSync'
import { clearLocalData, resetAllData } from './reset'

vi.mock('./s3', () => import('../test/fakeS3'))

const DEBOUNCE_MS = 700

const removeEntry = vi.fn(async (_name: string, _opts?: { recursive?: boolean }) => {})

/** Seeds local data and waits for a manifest of it to land in the bucket. */
async function seedAndUpload() {
  await seed({
    sourceWorks: [{ id: 'sw1', name: 'Work One' }],
    characters: [{ id: 'c1', name: 'Alice', sourceWorkIds: [] }],
    images: [makeImage({ contentHash: 'img1' })],
  })
  syncManifestNow(db)
  await vi.waitFor(() => {
    expect(bucket.inFlight).toBe(0)
    expect(bucket.manifest?.images).toHaveLength(1)
  })
}

beforeEach(async () => {
  // Node has no OPFS.
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { getDirectory: async () => ({ removeEntry }) },
  })
  useS3Mode()
  bucket.reset()
  await clearTables()
})

describe('resetAllData in S3 mode', () => {
  it('empties the remote manifest so a reload does not restore the cleared data', async () => {
    await seedAndUpload()

    await resetAllData()

    await vi.waitFor(() => {
      expect(bucket.inFlight).toBe(0)
      expect(bucket.manifest).toMatchObject({ images: [], characters: [], sourceWorks: [] })
    })

    // What App does on the next load.
    await maybeRestoreFromS3()
    expect(await db.images.count()).toBe(0)
    expect(await db.characters.count()).toBe(0)
    expect(await db.sourceWorks.count()).toBe(0)
  })
})

// clearLocalData is what switching storage mode or bucket uses, and must leave the old bucket intact.
describe('clearLocalData in S3 mode', () => {
  it('leaves the remote manifest untouched', async () => {
    await seedAndUpload()
    const before = bucket.manifestJson
    const putsBefore = bucket.puts.length

    await clearLocalData()
    await sleep(SETTLE_MS)

    expect(await db.images.count()).toBe(0)
    expect(bucket.puts).toHaveLength(putsBefore)
    expect(bucket.manifestJson).toBe(before)
  })

  it('drops a pending debounced sync instead of uploading the wiped state', async () => {
    await seedAndUpload()
    const before = bucket.manifestJson
    await db.images.update('img1', { notes: 'draft' }) // debounced

    await clearLocalData()
    await sleep(DEBOUNCE_MS + 300)

    expect(bucket.manifestJson).toBe(before)
  })

  it('drops a re-sync queued behind an in-flight upload', async () => {
    bucket.holdPuts = true
    await seed({ images: [makeImage({ contentHash: 'img1' })] })
    await db.images.add(makeImage({ contentHash: 'img2' }))
    await vi.waitFor(() => expect(bucket.pending).toHaveLength(1))
    await db.images.delete('img1') // queues a re-sync

    await clearLocalData()
    bucket.pending[0].resolve()
    await sleep(SETTLE_MS)

    // Only the upload that was already in flight lands; it carries pre-wipe data.
    expect(bucket.puts).toHaveLength(1)
    expect(bucket.manifest!.images.map(i => i.contentHash).sort()).toEqual(['img1', 'img2'])
  })

  it('removes the local OPFS image directory', async () => {
    await clearLocalData()

    expect(removeEntry).toHaveBeenCalledWith('images', { recursive: true })
  })
})
