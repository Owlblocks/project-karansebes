import { db } from '../db/database'

export async function resetAllData(): Promise<void> {
  await db.transaction('rw', db.images, db.characters, db.sourceWorks, async () => {
    await Promise.all([db.images.clear(), db.characters.clear(), db.sourceWorks.clear()])
  })

  const root = await navigator.storage.getDirectory()
  await root.removeEntry('images', { recursive: true }).catch(() => {})
}
