import { db, type Character, type ImageRecord, type SourceWork } from '../db/database'
import { withSyncSuppressed } from '../storage/manifestSync'
import { saveSettings } from '../storage/settings'

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Long enough for an immediate sync to have built and sent its manifest, if one was going to. */
export const SETTLE_MS = 100

export function useS3Mode(): void {
  saveSettings({
    version: 1,
    storageMode: 's3',
    s3: { bucket: 'test-bucket', region: 'us-east-1', accessKeyId: 'AKIATEST', secretAccessKey: 'secret' },
  })
}

export function useLocalMode(): void {
  saveSettings({ version: 1, storageMode: 'local' })
}

export function makeImage(overrides: Partial<ImageRecord> & { contentHash: string }): ImageRecord {
  return {
    opfsPath: `images/${overrides.contentHash}.png`,
    thumbnailDataUrl: 'data:image/png;base64,AAAA',
    mimeType: 'image/png',
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    imageText: null,
    characterIds: [],
    sourceWorkIds: [],
    situationTags: [],
    ...overrides,
  }
}

/** Writes records without triggering a manifest sync. */
export async function seed(data: { images?: ImageRecord[]; characters?: Character[]; sourceWorks?: SourceWork[] }) {
  await withSyncSuppressed(() =>
    db.transaction('rw', db.images, db.characters, db.sourceWorks, async () => {
      await db.sourceWorks.bulkAdd(data.sourceWorks ?? [])
      await db.characters.bulkAdd(data.characters ?? [])
      await db.images.bulkAdd(data.images ?? [])
    }),
  )
}

/** Empties all tables without triggering a manifest sync. */
export async function clearTables() {
  await withSyncSuppressed(() =>
    db.transaction('rw', db.images, db.characters, db.sourceWorks, async () => {
      await Promise.all([db.images.clear(), db.characters.clear(), db.sourceWorks.clear()])
    }),
  )
}
