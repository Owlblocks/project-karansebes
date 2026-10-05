import { db, type ImageRecord } from '../db/database'
import { getStorageMode } from './settings'
import { getManifestFromS3 } from './s3'
import { withSyncSuppressed } from './manifestSync'
import type { Manifest } from './manifest'

/**
 * If S3 mode is active and local storage looks freshly wiped (all tables empty),
 * restores metadata from the bucket's manifest.json. Image bytes are never
 * bulk-downloaded — they're fetched on demand when a user opens one.
 *
 * Throws if the manifest can't be fetched (offline, bad credentials, CORS). The
 * caller must not let the user write anything until this succeeds: the next
 * write would upload a near-empty manifest over the bucket's real one.
 */
export async function maybeRestoreFromS3(): Promise<boolean> {
  if (getStorageMode() !== 's3') return false

  const [imageCount, charCount, swCount] = await Promise.all([
    db.images.count(),
    db.characters.count(),
    db.sourceWorks.count(),
  ])
  if (imageCount > 0 || charCount > 0 || swCount > 0) return false

  const manifest = await getManifestFromS3<Manifest>()
  if (!manifest) return false

  await withSyncSuppressed(async () => {
    await db.transaction('rw', db.images, db.characters, db.sourceWorks, async () => {
      await db.sourceWorks.bulkPut(manifest.sourceWorks)
      await db.characters.bulkPut(manifest.characters)
      await db.images.bulkPut(manifest.images.map((img): ImageRecord => ({
        ...img,
        thumbnailDataUrl: '',
        createdAt: new Date(img.createdAt),
      })))
    })
  })

  return true
}
