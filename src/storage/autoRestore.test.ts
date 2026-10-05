import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { bucket, getManifestFromS3 } from '../test/fakeS3'
import { clearTables, makeImage, seed, SETTLE_MS, sleep, useLocalMode, useS3Mode } from '../test/helpers'
import { maybeRestoreFromS3 } from './autoRestore'
import { syncManifestNow } from './manifestSync'

vi.mock('./s3', () => import('../test/fakeS3'))

const sourceWorks = [{ id: 'sw1', name: 'Work One' }]
const characters = [{ id: 'c1', name: 'Alice', sourceWorkIds: ['sw1'] }]
const images = [
  makeImage({ contentHash: 'img1', characterIds: ['c1'], sourceWorkIds: ['sw1'], notes: 'hi', imageText: 'TEXT' }),
  makeImage({ contentHash: 'img2', situationTags: ['smug'], createdAt: new Date('2026-05-06T07:08:09.000Z') }),
]

/** Seeds the tables, uploads a manifest of them, then wipes local data as a cleared browser would. */
async function uploadThenWipe() {
  await seed({ sourceWorks, characters, images })
  syncManifestNow(db)
  await vi.waitFor(() => expect(bucket.inFlight === 0 && bucket.manifest !== null).toBe(true))
  await clearTables()
}

beforeEach(async () => {
  useS3Mode()
  bucket.reset()
  await clearTables()
})

describe('maybeRestoreFromS3', () => {
  it('round-trips metadata through the manifest, without thumbnails', async () => {
    await uploadThenWipe()

    expect(await maybeRestoreFromS3()).toBe(true)

    expect(await db.sourceWorks.toArray()).toEqual(sourceWorks)
    expect(await db.characters.toArray()).toEqual(characters)
    const restored = await db.images.orderBy('contentHash').toArray()
    expect(restored).toEqual(images.map(img => ({ ...img, thumbnailDataUrl: '' })))
    expect(restored[0].createdAt).toBeInstanceOf(Date)
  })

  it('does not re-upload the manifest it just restored', async () => {
    await uploadThenWipe()
    const putsBefore = bucket.puts.length

    await maybeRestoreFromS3()
    await sleep(SETTLE_MS)

    expect(bucket.puts).toHaveLength(putsBefore)
  })

  it('leaves existing local data alone, without fetching the manifest', async () => {
    await seed({ sourceWorks })

    expect(await maybeRestoreFromS3()).toBe(false)
    expect(getManifestFromS3).not.toHaveBeenCalled()
  })

  it('does nothing in local mode', async () => {
    useLocalMode()

    expect(await maybeRestoreFromS3()).toBe(false)
    expect(getManifestFromS3).not.toHaveBeenCalled()
  })

  it('does nothing when the bucket has no manifest', async () => {
    expect(await maybeRestoreFromS3()).toBe(false)
    expect(await db.images.count()).toBe(0)
  })

  // Swallowing this would leave an empty, writable library whose next sync
  // overwrites the bucket's manifest — the caller has to see the failure.
  it('throws when fetching the manifest fails', async () => {
    bucket.getError = new Error('AccessDenied')

    await expect(maybeRestoreFromS3()).rejects.toThrow('AccessDenied')
    expect(await db.images.count()).toBe(0)
  })
})
