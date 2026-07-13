import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/database'
import { ImageCard } from './components/ImageCard'
import { ImportButton } from './components/ImportButton'
import { ExportButton } from './components/ExportButton'
import { SearchBar } from './components/SearchBar'
import { LibraryModal } from './components/LibraryModal'

export function App() {
  const [search, setSearch] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [uncheckedOnly, setUncheckedOnly] = useState(false)

  const allImages = useLiveQuery(() => db.images.orderBy('createdAt').toArray(), [])
  const allCharacters = useLiveQuery(() => db.characters.toArray(), [])
  const allSourceWorks = useLiveQuery(() => db.sourceWorks.toArray(), [])

  const filtered = useMemo(() => {
    if (!allImages || !allCharacters || !allSourceWorks) return []
    const query = search.trim().toLowerCase()


    const sorted = [...allImages].reverse()
    const base = uncheckedOnly ? sorted.filter(img => img.imageText === null) : sorted
    if (!query) return base

    return base.filter(img => {
      if (img.situationTags.some(t => t.includes(query))) return true
      if (img.imageText && img.imageText.toLowerCase().includes(query)) return true
      if (img.notes && img.notes.toLowerCase().includes(query)) return true

      const charNames = img.characterIds
        .map(id => allCharacters.find(c => c.id === id)?.name.toLowerCase())
        .filter(Boolean) as string[]
      if (charNames.some(n => n.includes(query))) return true

      const sourceNames = img.sourceWorkIds
        .map(id => allSourceWorks.find(sw => sw.id === id)?.name.toLowerCase())
        .filter(Boolean) as string[]
      if (sourceNames.some(n => n.includes(query))) return true

      // also match source works reachable via characters
      const charSourceNames = img.characterIds.flatMap(cid => {
        const char = allCharacters.find(c => c.id === cid)
        return (char?.sourceWorkIds ?? [])
          .map(sid => allSourceWorks.find(sw => sw.id === sid)?.name.toLowerCase())
          .filter(Boolean) as string[]
      })
      if (charSourceNames.some(n => n.includes(query))) return true

      return false
    })
  }, [allImages, allCharacters, allSourceWorks, search, uncheckedOnly])

  const loading = allImages === undefined || allCharacters === undefined || allSourceWorks === undefined

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-3 flex gap-3 items-center">
        <h1 className="text-base font-semibold text-indigo-400 shrink-0 hidden sm:block">Project Karansebes</h1>
        <SearchBar value={search} onChange={setSearch} />
        <button
          onClick={() => setUncheckedOnly(v => !v)}
          className={`px-2 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${uncheckedOnly ? 'bg-amber-500 text-white hover:bg-amber-400' : 'bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white'}`}
        >
          <span className="sm:hidden">✓</span>
          <span className="hidden sm:inline">Unchecked</span>
        </button>
        <button
          onClick={() => setLibraryOpen(true)}
          className="px-2 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-sm font-medium transition-colors shrink-0"
        >
          <span className="sm:hidden">📚</span>
          <span className="hidden sm:inline">Library</span>
        </button>
        <ExportButton />
        <ImportButton />
      </header>
      {libraryOpen && <LibraryModal onClose={() => setLibraryOpen(false)} />}

      <main className="flex-1 min-w-0 p-4">
        {loading ? (
          <p className="text-slate-500 text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500">
            <p className="text-lg">{allImages.length === 0 ? 'No images yet' : 'No results'}</p>
            {allImages.length === 0 && (
              <p className="text-sm">Click "Import Images" to get started</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map(img => (
              <ImageCard
                key={img.contentHash}
                image={img}
                characters={allCharacters}
                sourceWorks={allSourceWorks}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
