import type { KaransebesDB, ImageRecord, Character, SourceWork } from '../db/database'

export type ManifestImage = Omit<ImageRecord, 'thumbnailDataUrl'>

export interface Manifest {
  version: 1
  exportedAt: string
  images: ManifestImage[]
  characters: Character[]
  sourceWorks: SourceWork[]
}

export async function buildManifest(db: KaransebesDB): Promise<Manifest> {
  const [images, characters, sourceWorks] = await Promise.all([
    db.images.toArray(),
    db.characters.toArray(),
    db.sourceWorks.toArray(),
  ])

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    images: images.map(({ thumbnailDataUrl: _, ...rest }) => rest),
    characters,
    sourceWorks,
  }
}
