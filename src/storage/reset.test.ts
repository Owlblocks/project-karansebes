import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { bucket } from '../test/fakeS3'
import { clearTables, makeImage, seed, useS3Mode } from '../test/helpers'
import { maybeRestoreFromS3 } from './autoRestore'
import { syncManifestNow } from './manifestSync'
import { clearLocalData } from './reset'

vi.mock('./s3', () => import('../test/fakeS3'))

const removeEntry = vi.fn(async (_name: string, _opts?: { recursive?: boolean }) => {})

beforeEach(async () => {
  // jsdom has no OPFS.
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { getDirectory: async () => ({ removeEntry }) },
  })
  useS3Mode()
  bucket.reset()
  await clearTables()
})

describe('clearLocalData in S3 mode', () => {
  it('empties the remote manifest so a reload does not restore the cleared data', async () => {
    await seed({
      sourceWorks: [{ id: 'sw1', name: 'Work One' }],
      characters: [{ id: 'c1', name: 'Alice', sourceWorkIds: [] }],
      images: [makeImage({ contentHash: 'img1' })],
    })
    syncManifestNow(db)
    await vi.waitFor(() => expect(bucket.manifest?.images).toHaveLength(1))

    await clearLocalData()

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

  it('removes the local OPFS image directory', async () => {
    await clearLocalData()
    await vi.waitFor(() => expect(bucket.inFlight).toBe(0))

    expect(removeEntry).toHaveBeenCalledWith('images', { recursive: true })
  })
})
