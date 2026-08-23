import Dexie from 'dexie'
import type { KaransebesDB } from '../db/database'
import { getStorageMode } from './settings'
import { putManifestToS3 } from './s3'
import { buildManifest } from './manifest'

const DEBOUNCE_MS = 700

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let suppressDepth = 0
let flushing = false
let flushAgain = false

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
    flush(db)
    return
  }

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    flush(db)
  }, DEBOUNCE_MS)
}

export function syncManifestNow(db: KaransebesDB): void {
  scheduleManifestSync(db, true)
}

// Single-flights the upload: if a flush is already in progress when another is
// requested, it doesn't start a second overlapping PUT (which could race the
// first and land on S3 out of order) — it just re-runs once the current one
// finishes, so S3 always ends up with the latest state.
//
// scheduleManifestSync is called synchronously from inside Dexie hooks, whose
// onsuccess fires while the triggering write's transaction is still the
// ambient one (Dexie's PSD zone). buildManifest reads all three tables, but
// that transaction may only cover the one table that was written (e.g. just
// sourceWorks for an add/delete) — so without escaping the zone, Dexie tries
// to join those reads to the narrower transaction and IndexedDB throws
// NotFoundError for any store outside its scope. Dexie.ignoreTransaction
// detaches the callback so its Dexie calls open their own transaction.
function flush(db: KaransebesDB): void {
  if (flushing) {
    flushAgain = true
    return
  }
  flushing = true
  Dexie.ignoreTransaction(() => {
    void (async () => {
      try {
        await putManifestToS3(await buildManifest(db))
      } catch (err) {
        console.error('Failed to sync manifest to S3:', err)
      } finally {
        flushing = false
        if (flushAgain) {
          flushAgain = false
          flush(db)
        }
      }
    })()
  })
}
