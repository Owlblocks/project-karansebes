import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { db } from '../db/database'
import { bucket, getImageFileFromS3, saveImageToS3 } from '../test/fakeS3'
import { clearTables, makeImage, seed, SETTLE_MS, sleep, useS3Mode } from '../test/helpers'
import { maybeRestoreFromS3 } from './autoRestore'
import { syncManifestNow } from './manifestSync'
import { generateThumbnail } from './opfs'
import { backfillThumbnails } from './thumbnails'

vi.mock('./s3', () => import('../test/fakeS3'))
// Node can't decode images; the fake thumbnail records which bytes it was made from.
vi.mock('./opfs', async importOriginal => ({
  ...(await importOriginal<typeof import('./opfs')>()),
  generateThumbnail: vi.fn(async (buffer: ArrayBuffer) => `data:thumb;${new TextDecoder().decode(buffer)}`),
}))

let consoleError: MockInstance

/** Puts an image's bytes in the bucket, as an earlier import would have. */
async function storeInBucket(contentHash: string) {
  return saveImageToS3(new TextEncoder().encode(`bytes-${contentHash}`).buffer, contentHash, 'png', 'image/png')
}

beforeEach(async () => {
  useS3Mode()
  bucket.reset()
  await clearTables()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('backfillThumbnails', () => {
  it('fills in thumbnails after a restore from S3, without re-uploading the manifest', async () => {
    const images = await Promise.all(['aaa', 'bbb', 'ccc'].map(async hash =>
      makeImage({ contentHash: hash, opfsPath: await storeInBucket(hash) }),
    ))
    await seed({ images })
    syncManifestNow(db)
    await vi.waitFor(() => expect(bucket.inFlight === 0 && bucket.manifest !== null).toBe(true))
    await clearTables()
    await maybeRestoreFromS3()
    expect((await db.images.toArray()).every(img => img.thumbnailDataUrl === '')).toBe(true)
    const putsBefore = bucket.puts.length

    await backfillThumbnails()

    for (const hash of ['aaa', 'bbb', 'ccc']) {
      expect((await db.images.get(hash))!.thumbnailDataUrl).toBe(`data:thumb;bytes-${hash}`)
    }
    await sleep(SETTLE_MS)
    expect(bucket.puts).toHaveLength(putsBefore)
  })

  it('leaves images that already have a thumbnail alone', async () => {
    await seed({ images: [
      makeImage({ contentHash: 'aaa', opfsPath: await storeInBucket('aaa'), thumbnailDataUrl: '' }),
      makeImage({ contentHash: 'bbb', opfsPath: await storeInBucket('bbb'), thumbnailDataUrl: 'data:existing' }),
    ] })

    await backfillThumbnails()

    expect(getImageFileFromS3).toHaveBeenCalledTimes(1)
    expect(getImageFileFromS3).toHaveBeenCalledWith('images/aaa.png')
    expect((await db.images.get('bbb'))!.thumbnailDataUrl).toBe('data:existing')
  })

  it('leaves an image blank when its fetch fails, and carries on with the rest', async () => {
    await seed({ images: [
      makeImage({ contentHash: 'gone', opfsPath: 'images/gone.png', thumbnailDataUrl: '' }), // not in bucket
      makeImage({ contentHash: 'aaa', opfsPath: await storeInBucket('aaa'), thumbnailDataUrl: '' }),
    ] })

    await backfillThumbnails()

    expect((await db.images.get('gone'))!.thumbnailDataUrl).toBe('')
    expect((await db.images.get('aaa'))!.thumbnailDataUrl).toBe('data:thumb;bytes-aaa')
    expect(consoleError).toHaveBeenCalledWith('Failed to generate thumbnail for gone:', expect.any(Error))
  })

  it('shares one run between overlapping calls', async () => {
    await seed({ images: [makeImage({ contentHash: 'aaa', opfsPath: await storeInBucket('aaa'), thumbnailDataUrl: '' })] })

    await Promise.all([backfillThumbnails(), backfillThumbnails()])

    expect(generateThumbnail).toHaveBeenCalledTimes(1)
  })

  it('handles more images than its concurrency limit', async () => {
    const hashes = Array.from({ length: 10 }, (_, i) => `img${i}`)
    await seed({ images: await Promise.all(hashes.map(async hash =>
      makeImage({ contentHash: hash, opfsPath: await storeInBucket(hash), thumbnailDataUrl: '' }),
    )) })

    await backfillThumbnails()

    expect(await db.images.filter(img => img.thumbnailDataUrl === '').count()).toBe(0)
    expect(generateThumbnail).toHaveBeenCalledTimes(10)
  })
})
