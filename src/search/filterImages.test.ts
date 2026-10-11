import { describe, expect, it } from 'vitest'
import type { Character, ImageRecord, SourceWork } from '../db/database'
import { makeImage } from '../test/helpers'
import { buildSearchLookups, filterImages } from './filterImages'

const sourceWorks: SourceWork[] = [
  { id: 'sw-eva', name: 'Neon Genesis Evangelion' },
  { id: 'sw-simpsons', name: 'The Simpsons' },
]

const characters: Character[] = [
  { id: 'ch-asuka', name: 'Asuka Langley', sourceWorkIds: ['sw-eva'] },
  { id: 'ch-pepe', name: 'Pepe', sourceWorkIds: [] },
  { id: 'ch-crossover', name: 'Crossover Guy', sourceWorkIds: ['sw-eva', 'sw-simpsons'] },
]

const lookups = buildSearchLookups(characters, sourceWorks)

/** Runs the filter and returns the matching images' hashes, in result order. */
function search(images: ImageRecord[], query: string, uncheckedOnly = false): string[] {
  return filterImages(images, lookups, query, uncheckedOnly).map(img => img.contentHash)
}

describe('filterImages', () => {
  describe('ordering and the unchecked filter', () => {
    // in createdAt order, as the grid's Dexie query returns them
    const images = [
      makeImage({ contentHash: 'oldest', imageText: null }),
      makeImage({ contentHash: 'middle', imageText: '' }),
      makeImage({ contentHash: 'newest', imageText: 'hello' }),
    ]

    it('returns every image newest-first when the query is empty', () => {
      expect(search(images, '')).toEqual(['newest', 'middle', 'oldest'])
    })

    it('treats a whitespace-only query as empty', () => {
      expect(search(images, '   ')).toEqual(['newest', 'middle', 'oldest'])
    })

    it('does not mutate the input array', () => {
      search(images, '')
      expect(images.map(img => img.contentHash)).toEqual(['oldest', 'middle', 'newest'])
    })

    it('keeps only images whose text has not been checked (null, not "")', () => {
      expect(search(images, '', true)).toEqual(['oldest'])
    })

    it('applies the unchecked filter together with a query', () => {
      const mixed = [
        makeImage({ contentHash: 'unchecked-match', imageText: null, notes: 'cat' }),
        makeImage({ contentHash: 'checked-match', imageText: '', notes: 'cat' }),
        makeImage({ contentHash: 'unchecked-miss', imageText: null, notes: 'dog' }),
      ]
      expect(search(mixed, 'cat', true)).toEqual(['unchecked-match'])
    })
  })

  describe('fields matched', () => {
    it('matches situation tags by substring', () => {
      const images = [
        makeImage({ contentHash: 'tagged', situationTags: ['happy-birthday'] }),
        makeImage({ contentHash: 'other', situationTags: ['skepticism'] }),
      ]
      expect(search(images, 'birthday')).toEqual(['tagged'])
    })

    it('matches image text case-insensitively', () => {
      const images = [
        makeImage({ contentHash: 'text', imageText: 'GET IN THE ROBOT' }),
        makeImage({ contentHash: 'other', imageText: 'something else' }),
      ]
      expect(search(images, 'In The Robot')).toEqual(['text'])
    })

    it('matches notes case-insensitively', () => {
      const images = [
        makeImage({ contentHash: 'noted', notes: 'Use for Monday mornings' }),
        makeImage({ contentHash: 'other' }),
      ]
      expect(search(images, 'monday')).toEqual(['noted'])
    })

    it('matches a tagged character by name', () => {
      const images = [
        makeImage({ contentHash: 'asuka', characterIds: ['ch-asuka'] }),
        makeImage({ contentHash: 'pepe', characterIds: ['ch-pepe'] }),
      ]
      expect(search(images, 'ASUKA')).toEqual(['asuka'])
    })

    it('matches a directly tagged source work', () => {
      const images = [
        makeImage({ contentHash: 'simpsons', sourceWorkIds: ['sw-simpsons'] }),
        makeImage({ contentHash: 'other' }),
      ]
      expect(search(images, 'simpsons')).toEqual(['simpsons'])
    })

    it("matches a source work reached through a tagged character", () => {
      const images = [
        makeImage({ contentHash: 'asuka', characterIds: ['ch-asuka'] }),
        makeImage({ contentHash: 'pepe', characterIds: ['ch-pepe'] }),
      ]
      expect(search(images, 'evangelion')).toEqual(['asuka'])
    })

    it("matches any of a crossover character's source works", () => {
      const images = [makeImage({ contentHash: 'crossover', characterIds: ['ch-crossover'] })]
      expect(search(images, 'evangelion')).toEqual(['crossover'])
      expect(search(images, 'simpsons')).toEqual(['crossover'])
    })

    it('does not match on fields it does not search', () => {
      const images = [makeImage({ contentHash: 'abc123', mimeType: 'image/png' })]
      expect(search(images, 'abc123')).toEqual([])
      expect(search(images, 'png')).toEqual([])
    })
  })

  describe('dangling references', () => {
    it('ignores character and source ids that no longer exist', () => {
      const images = [
        makeImage({ contentHash: 'dangling', characterIds: ['ch-deleted'], sourceWorkIds: ['sw-deleted'] }),
        makeImage({ contentHash: 'asuka', characterIds: ['ch-deleted', 'ch-asuka'] }),
      ]
      expect(search(images, 'asuka')).toEqual(['asuka'])
      expect(search(images, '', false)).toEqual(['asuka', 'dangling'])
    })

    it("ignores a character's source id that no longer exists", () => {
      const orphanLookups = buildSearchLookups(
        [{ id: 'ch-orphan', name: 'Orphan', sourceWorkIds: ['sw-deleted', 'sw-eva'] }],
        sourceWorks,
      )
      const images = [makeImage({ contentHash: 'orphan', characterIds: ['ch-orphan'] })]
      expect(filterImages(images, orphanLookups, 'evangelion', false).map(i => i.contentHash)).toEqual(['orphan'])
    })
  })
})
