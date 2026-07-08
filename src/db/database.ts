import Dexie, { type Table } from 'dexie'

export interface ImageRecord {
  contentHash: string
  filename: string
  opfsPath: string
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

class KaransebesDB extends Dexie {
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
  }
}

export const db = new KaransebesDB()
