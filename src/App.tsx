import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/database'
import { ImageCard } from './components/ImageCard'
import { ImportButton } from './components/ImportButton'
import { SearchBar } from './components/SearchBar'

type SortKey = 'createdAt' | 'filename'

export function App() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('createdAt')

  const allImages = useLiveQuery(
    () => db.images.orderBy(sort).toArray(),
    [sort]
  )

  const filtered = useMemo(() => {
    if (!allImages) return []
    const query = search.trim().toLowerCase()
    if (!query) return sort === 'createdAt' ? [...allImages].reverse() : allImages
    return allImages.filter(img =>
      img.tags.some(tag => tag.includes(query)) ||
      img.filename.toLowerCase().includes(query)
    )
  }, [allImages, search, sort])

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-3 flex gap-3 items-center">
        <h1 className="text-base font-semibold text-indigo-400 shrink-0">Reaction Tagger</h1>
        <SearchBar value={search} onChange={setSearch} />
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="bg-slate-800 text-slate-300 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="createdAt">Newest</option>
          <option value="filename">Name</option>
        </select>
        <ImportButton />
      </header>

      <main className="flex-1 p-4">
        {allImages === undefined ? (
          <p className="text-slate-500 text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500">
            <p className="text-lg">{allImages.length === 0 ? 'No images yet' : 'No results'}</p>
            {allImages.length === 0 && (
              <p className="text-sm">Click "Import Images" to get started</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map(img => (
              <ImageCard key={img.id} image={img} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
