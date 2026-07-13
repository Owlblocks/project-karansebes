import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/database'
import { ImageCard } from './components/ImageCard'
import { ImportButton } from './components/ImportButton'
import { ExportButton } from './components/ExportButton'
import { SearchBar } from './components/SearchBar'
import { LibraryModal } from './components/LibraryModal'
import { useFileImport } from './hooks/useFileImport'

function hasDragFiles(dt: DataTransfer): boolean {
  if (dt.items) return Array.from(dt.items).some(i => i.kind === 'file')
  return Array.from(dt.types).some(t => t.toLowerCase() === 'files')
}

export function App() {
  const [search, setSearch] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [uncheckedOnly, setUncheckedOnly] = useState(false)
  const [dragging, setDragging] = useState(false)

  const { importing: dragImporting, progress: dragProgress, handleFiles } = useFileImport()

  // Capture-phase listener on window fires before React's delegation system,
  // which is what the browser checks when deciding to show the "not allowed" cursor.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault()
    window.addEventListener('dragover', stop, true)
    window.addEventListener('drop', stop, true)
    return () => {
      window.removeEventListener('dragover', stop, true)
      window.removeEventListener('drop', stop, true)
    }
  }, [])

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
    <div
      className="min-h-screen bg-slate-950 text-white flex flex-col"
      onDragStart={e => e.preventDefault()}
      onDragEnter={e => {
        e.preventDefault()
        if (hasDragFiles(e.dataTransfer)) setDragging(true)
      }}
      onDragOver={e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        const dt = e.dataTransfer
        const files: File[] = dt.files.length > 0
          ? Array.from(dt.files)
          : Array.from(dt.items)
              .filter(i => i.kind === 'file')
              .map(i => i.getAsFile())
              .filter((f): f is File => f !== null)
        if (files.length > 0) handleFiles(files)
      }}
    >
      {(dragging || dragImporting) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm pointer-events-none">
          <div className="border-2 border-dashed border-indigo-400 rounded-2xl px-16 py-12 flex flex-col items-center gap-4 text-indigo-300">
            {dragImporting ? (
              <>
                <svg className="w-16 h-16 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 100 10h-2a8 8 0 01-8-8z" />
                </svg>
                <p className="text-xl font-semibold">{dragProgress ?? 'Importing…'}</p>
              </>
            ) : (
              <>
                <svg className="w-16 h-16" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-2xl font-semibold">Drop to import</p>
                <p className="text-sm text-slate-400">Images or ZIP archives</p>
              </>
            )}
          </div>
        </div>
      )}

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
