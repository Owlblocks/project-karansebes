import Dexie, { type Table } from 'dexie'
import { scheduleManifestSync } from '../storage/manifestSync'

export interface ImageRecord {
  contentHash: string
  opfsPath: string // storage key for the active backend: OPFS filename (local) or S3 object key (s3)
  thumbnailDataUrl: string
  mimeType: string
  createdAt: Date
  imageText: string | null  // null = unchecked, "" = confirmed no text, string = transcribed text
  notes?: string
  characterIds: string[]
  sourceWorkIds: string[]
  situationTags: string[]
}

export interface Character {
  id?: string
  name: string
  sourceWorkIds: string[]
}

export interface SourceWork {
  id?: string
  name: string
}

export class KaransebesDB extends Dexie {
  images!: Table<ImageRecord>
  characters!: Table<Character>
  sourceWorks!: Table<SourceWork>

  constructor() {
    super('KaransebesDB')
    this.version(1).stores({
      images: 'contentHash, createdAt, *characterIds, *sourceWorkIds, *situationTags',
      characters: 'id, name, *sourceWorkIds',
      sourceWorks: 'id, name',
    })
    this.version(2).stores({}).upgrade(tx =>
      tx.table('images').toCollection().modify(img => { delete img.filename })
    )

    const TEXT_FIELDS = new Set(['notes', 'imageText'])

    this.images.hook('creating', function () {
      this.onsuccess = () => scheduleManifestSync(db, true)
    })
    // Dexie diffs arrays and Dates by reference against a deep clone, so every
    // array field shows up in `modifications` even when unchanged — filter down
    // to the fields whose values actually differ from the stored record.
    this.images.hook('updating', function (modifications, _key, obj) {
      const keys = Object.entries(modifications)
        .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((obj as unknown as Record<string, unknown>)[k]))
        .map(([k]) => k)
      if (keys.length === 0 || keys.every(k => k === 'thumbnailDataUrl')) return
      const textOnly = keys.every(k => TEXT_FIELDS.has(k))
      this.onsuccess = () => scheduleManifestSync(db, !textOnly)
    })
    this.images.hook('deleting', function () {
      this.onsuccess = () => scheduleManifestSync(db, true)
    })

    for (const table of [this.characters, this.sourceWorks]) {
      table.hook('creating', function () {
        this.onsuccess = () => scheduleManifestSync(db, true)
      })
      table.hook('updating', function () {
        this.onsuccess = () => scheduleManifestSync(db, true)
      })
      table.hook('deleting', function () {
        this.onsuccess = () => scheduleManifestSync(db, true)
      })
    }
  }
}

export const db = new KaransebesDB()
