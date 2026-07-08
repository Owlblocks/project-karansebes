import Dexie, { type Table } from 'dexie'

export interface ImageRecord {
  id?: number
  filename: string
  opfsPath: string
  thumbnailDataUrl: string
  mimeType: string
  createdAt: Date
  contentHash: string
  imageText: string | null  // null = unchecked, "" = confirmed no text, string = transcribed text
  notes?: string
  characterIds: number[]
  sourceWorkIds: number[]
  situationTags: string[]
}

export interface Character {
  id?: number
  name: string
  sourceWorkIds: number[]
}

export interface SourceWork {
  id?: number
  name: string
}

class ReactionTaggerDB extends Dexie {
  images!: Table<ImageRecord>
  characters!: Table<Character>
  sourceWorks!: Table<SourceWork>

  constructor() {
    super('ReactionTaggerDB')
    this.version(2).stores({
      images: '++id, createdAt, *characterIds, *sourceWorkIds, *situationTags, contentHash',
      characters: '++id, name, *sourceWorkIds',
      sourceWorks: '++id, name',
    })
  }
}

export const db = new ReactionTaggerDB()
