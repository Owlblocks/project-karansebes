import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/database'
import { ImageCard } from './components/ImageCard'
import { ImportButton } from './components/ImportButton'
import { ExportButton } from './components/ExportButton'
import { SearchBar } from './components/SearchBar'
import { LibraryModal } from './components/LibraryModal'
import { SettingsModal } from './components/SettingsModal'
import { getStorageMode } from './storage/settings'
import { maybeRestoreFromS3 } from './storage/autoRestore'
import { backfillThumbnails } from './storage/thumbnails'
import { buildSearchLookups, filterImages } from './search/filterImages'

export function App() {
  const [search, setSearch] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [uncheckedOnly, setUncheckedOnly] = useState(false)
  const [restoring, setRestoring] = useState(() => getStorageMode() === 's3')
  const [restoreError, setRestoreError] = useState<string | null>(null)

  // Until the S3 restore check succeeds, the library stays hidden: an empty,
  // editable library would let the next write overwrite the bucket's manifest.
  function runRestore() {
    setRestoring(true)
    setRestoreError(null)
    maybeRestoreFromS3()
      .then(() => {
        setRestoring(false)
        void backfillThumbnails()
      })
      .catch(err => {
        console.error('Restore from S3 failed:', err)
        setRestoring(false)
        setRestoreError(err?.message ?? String(err))
      })
  }

  useEffect(() => {
    if (restoring) runRestore()
  }, [])

  const allImages = useLiveQuery(() => db.images.orderBy('createdAt').toArray(), [])
  const allCharacters = useLiveQuery(() => db.characters.toArray(), [])
  const allSourceWorks = useLiveQuery(() => db.sourceWorks.toArray(), [])

  // rebuilt only when the entity tables change, not on every keystroke
  const lookups = useMemo(
    () => buildSearchLookups(allCharacters ?? [], allSourceWorks ?? []),
    [allCharacters, allSourceWorks],
  )

  const filtered = useMemo(() => {
    if (!allImages || !allCharacters || !allSourceWorks) return []
    return filterImages(allImages, lookups, search, uncheckedOnly)
  }, [allImages, allCharacters, allSourceWorks, lookups, search, uncheckedOnly])

  if (restoreError !== null) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-4 p-4 text-center">
        <h1 className="text-lg font-semibold text-red-400">Couldn't load your library from S3</h1>
        <p className="text-sm text-slate-400 max-w-md">
          Check your connection and S3 settings. The app stays locked until it can read the bucket, so that it doesn't overwrite your saved catalog.
        </p>
        <p className="text-xs font-mono text-slate-500 max-w-md break-words">{restoreError}</p>
        <div className="flex gap-2">
          <button
            onClick={runRestore}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Retry
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-sm font-medium transition-colors"
          >
            Settings
          </button>
        </div>
        {settingsOpen && <SettingsModal onClose={() => { setSettingsOpen(false); runRestore() }} />}
      </div>
    )
  }

  const loading = restoring || allImages === undefined || allCharacters === undefined || allSourceWorks === undefined

  return (
    <div
      className="min-h-screen bg-slate-950 text-white flex flex-col"
      onDragStart={e => e.preventDefault()}
    >
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
        <button
          onClick={() => setSettingsOpen(true)}
          className="px-2 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-sm font-medium transition-colors shrink-0"
        >
          <span className="sm:hidden">⚙️</span>
          <span className="hidden sm:inline">Settings</span>
        </button>
      </header>
      {libraryOpen && <LibraryModal onClose={() => setLibraryOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

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
