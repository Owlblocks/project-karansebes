import Dexie, { type Table } from 'dexie'

export interface ImageRecord {
  id?: number
  filename: string
  opfsPath: string
  tags: string[]
  createdAt: Date
  mimeType: string
  thumbnailDataUrl: string
}

class ReactionTaggerDB extends Dexie {
  images!: Table<ImageRecord>

  constructor() {
    super('ReactionTaggerDB')
    this.version(1).stores({
      // ++id = auto-increment primary key
      // *tags = multi-valued index (lets you query WHERE tags INCLUDES "foo")
      images: '++id, filename, createdAt, *tags',
    })
  }
}

export const db = new ReactionTaggerDB()
