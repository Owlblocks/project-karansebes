import type { KaransebesDB } from '../db/database'
import { getStorageMode } from './settings'
import { putManifestToS3 } from './s3'
import { buildManifest } from './manifest'

const DEBOUNCE_MS = 700

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let suppressDepth = 0

/** Suppresses manifest sync for the duration of a bulk local operation (reset, import, restore). */
export async function withSyncSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  suppressDepth++
  try {
    return await fn()
  } finally {
    suppressDepth--
  }
}

export function scheduleManifestSync(db: KaransebesDB, immediate: boolean): void {
  if (suppressDepth > 0 || getStorageMode() !== 's3') return

  if (immediate) {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    void flush(db)
    return
  }

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void flush(db)
  }, DEBOUNCE_MS)
}

export function syncManifestNow(db: KaransebesDB): void {
  scheduleManifestSync(db, true)
}

async function flush(db: KaransebesDB): Promise<void> {
  try {
    await putManifestToS3(await buildManifest(db))
  } catch (err) {
    console.error('Failed to sync manifest to S3:', err)
  }
}
