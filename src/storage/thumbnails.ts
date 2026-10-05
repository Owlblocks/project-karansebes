import { db } from '../db/database'
import { getImageFile } from './images'
import { generateThumbnail } from './opfs'

const CONCURRENCY = 4

let running: Promise<void> | null = null

/**
 * Generates thumbnails for images that have none — after an S3 restore every
 * image starts blank. Fetches each image's bytes from the active backend; an
 * image that fails stays blank and is retried on the next run. Concurrent
 * calls share one run.
 */
export function backfillThumbnails(): Promise<void> {
  if (!running) running = run().finally(() => { running = null })
  return running
}

async function run(): Promise<void> {
  const hashes = (await db.images.filter(img => !img.thumbnailDataUrl).primaryKeys()) as string[]
  let next = 0

  async function worker() {
    while (next < hashes.length) {
      const contentHash = hashes[next++]
      try {
        const img = await db.images.get(contentHash)
        if (!img || img.thumbnailDataUrl) continue // deleted or filled in meanwhile
        const file = await getImageFile(img.opfsPath)
        const thumbnailDataUrl = await generateThumbnail(await file.arrayBuffer(), img.mimeType)
        await db.images.update(contentHash, { thumbnailDataUrl })
      } catch (err) {
        console.error(`Failed to generate thumbnail for ${contentHash}:`, err)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}
