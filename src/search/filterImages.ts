import type { Character, ImageRecord, SourceWork } from '../db/database'

/** id lookups for the search filter; build once per change to the entity tables, not per keystroke. */
export interface SearchLookups {
  charactersById: Map<string | undefined, Character>
  sourceNamesById: Map<string | undefined, string> // lowercased names
}

export function buildSearchLookups(characters: Character[], sourceWorks: SourceWork[]): SearchLookups {
  return {
    charactersById: new Map(characters.map(c => [c.id, c])),
    sourceNamesById: new Map(sourceWorks.map(sw => [sw.id, sw.name.toLowerCase()])),
  }
}

/**
 * Returns images newest-first, keeping those that match the query in their
 * situation tags, image text, notes, character names, source works, or the
 * source works of their characters. Matching is a case-insensitive substring.
 * `images` is expected in createdAt order, as the grid query returns it.
 */
export function filterImages(
  images: ImageRecord[],
  { charactersById, sourceNamesById }: SearchLookups,
  search: string,
  uncheckedOnly: boolean,
): ImageRecord[] {
  const query = search.trim().toLowerCase()

  const sorted = [...images].reverse()
  const base = uncheckedOnly ? sorted.filter(img => img.imageText === null) : sorted
  if (!query) return base

  return base.filter(img => {
    if (img.situationTags.some(t => t.includes(query))) return true
    if (img.imageText && img.imageText.toLowerCase().includes(query)) return true
    if (img.notes && img.notes.toLowerCase().includes(query)) return true

    const charNames = img.characterIds
      .map(id => charactersById.get(id)?.name.toLowerCase())
      .filter(Boolean) as string[]
    if (charNames.some(n => n.includes(query))) return true

    const sourceNames = img.sourceWorkIds
      .map(id => sourceNamesById.get(id))
      .filter(Boolean) as string[]
    if (sourceNames.some(n => n.includes(query))) return true

    // also match source works reachable via characters
    const charSourceNames = img.characterIds.flatMap(cid => {
      const char = charactersById.get(cid)
      return (char?.sourceWorkIds ?? [])
        .map(sid => sourceNamesById.get(sid))
        .filter(Boolean) as string[]
    })
    if (charSourceNames.some(n => n.includes(query))) return true

    return false
  })
}
