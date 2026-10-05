import { db } from '../db/database'
import { withSyncSuppressed, syncManifestNow, cancelPendingSync } from './manifestSync'

/** Wipes this device's data only; a remote bucket is left untouched. */
export async function clearLocalData(): Promise<void> {
  cancelPendingSync()
  await withSyncSuppressed(async () => {
    await db.transaction('rw', db.images, db.characters, db.sourceWorks, async () => {
      await Promise.all([db.images.clear(), db.characters.clear(), db.sourceWorks.clear()])
    })
  })

  const root = await navigator.storage.getDirectory()
  await root.removeEntry('images', { recursive: true }).catch(() => {})
}

/** Wipes local data and, in S3 mode, empties the remote manifest so the next load doesn't restore it. */
export async function resetAllData(): Promise<void> {
  await clearLocalData()
  syncManifestNow(db)
}
