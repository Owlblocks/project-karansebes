import { useState, type KeyboardEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ImageRecord, type Character } from '../db/database'

interface Props {
  image: ImageRecord
  onClose: () => void
}

export function TagEditor({ image, onClose }: Props) {
  const [imageText, setImageText] = useState<string | null>(image.imageText)
  const [notes, setNotes] = useState(image.notes ?? '')
  const [characterIds, setCharacterIds] = useState<string[]>(image.characterIds)
  const [sourceWorkIds, setSourceWorkIds] = useState<string[]>(image.sourceWorkIds)
  const [situationTags, setSituationTags] = useState<string[]>(image.situationTags)
  const [charInput, setCharInput] = useState('')
  const [sourceInput, setSourceInput] = useState('')
  const [sitInput, setSitInput] = useState('')

  const allCharacters = useLiveQuery(() => db.characters.orderBy('name').toArray(), [])
  const allSourceWorks = useLiveQuery(() => db.sourceWorks.orderBy('name').toArray(), [])

  function characterLabel(char: Character): string {
    if (!allSourceWorks || char.sourceWorkIds.length === 0) return char.name
    const sources = char.sourceWorkIds
      .map(id => allSourceWorks.find(sw => sw.id === id)?.name)
      .filter(Boolean)
    return sources.length > 0 ? `${char.name} (${sources.join(', ')})` : char.name
  }

  // Characters
  const filteredChars = (allCharacters ?? []).filter(c =>
    !characterIds.includes(c.id!) &&
    c.name.toLowerCase().includes(charInput.toLowerCase())
  )
  const showCharCreate = charInput.trim().length > 0 &&
    !(allCharacters ?? []).some(c => c.name.toLowerCase() === charInput.trim().toLowerCase())

  function addCharacter(id: string) {
    setCharacterIds(prev => [...prev, id])
    setCharInput('')
  }

  async function quickAddCharacter() {
    const name = charInput.trim()
    if (!name) return
    const id = crypto.randomUUID()
    await db.characters.add({ id, name, sourceWorkIds: [] })
    addCharacter(id)
  }

  // Source works
  const filteredSources = (allSourceWorks ?? []).filter(sw =>
    !sourceWorkIds.includes(sw.id!) &&
    sw.name.toLowerCase().includes(sourceInput.toLowerCase())
  )
  const showSourceCreate = sourceInput.trim().length > 0 &&
    !(allSourceWorks ?? []).some(sw => sw.name.toLowerCase() === sourceInput.trim().toLowerCase())

  function addSourceWork(id: string) {
    setSourceWorkIds(prev => [...prev, id])
    setSourceInput('')
  }

  async function quickAddSourceWork() {
    const name = sourceInput.trim()
    if (!name) return
    const id = crypto.randomUUID()
    await db.sourceWorks.add({ id, name })
    addSourceWork(id)
  }

  // Situation tags
  function addSituationTag() {
    const tag = sitInput.trim().toLowerCase()
    if (tag && !situationTags.includes(tag)) setSituationTags(prev => [...prev, tag])
    setSitInput('')
  }

  function handleSitKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addSituationTag()
    } else if (e.key === 'Backspace' && sitInput === '' && situationTags.length > 0) {
      setSituationTags(prev => prev.slice(0, -1))
    }
  }

  async function save() {
    await db.images.update(image.contentHash, {
      imageText,
      notes: notes.trim() || undefined,
      characterIds,
      sourceWorkIds,
      situationTags,
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-lg flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        <img
          src={image.thumbnailDataUrl}
          alt={image.filename}
          className="w-full max-h-40 object-contain rounded-lg bg-slate-900 shrink-0"
        />

        {/* Image text */}
        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-300">Image text</span>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={imageText === ''}
              onChange={e => setImageText(e.target.checked ? '' : null)}
              className="accent-indigo-500"
            />
            No text in this image
          </label>
          {imageText !== '' && (
            <textarea
              value={imageText ?? ''}
              onChange={e => setImageText(e.target.value || null)}
              placeholder="Transcribe text visible in the image…"
              rows={2}
              className="bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none placeholder:text-slate-500"
            />
          )}
        </section>

        {/* Notes */}
        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-300">
            Notes <span className="text-slate-500 font-normal">(optional)</span>
          </span>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. use for sarcastic agreement…"
            rows={2}
            className="bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none placeholder:text-slate-500"
          />
        </section>

        {/* Characters */}
        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-300">Characters</span>
          <div className="flex flex-wrap gap-1.5">
            {characterIds.map(id => {
              const char = allCharacters?.find(c => c.id === id)
              if (!char) return null
              return (
                <span key={id} className="flex items-center gap-1 px-2 py-1 bg-violet-700 text-white text-xs rounded-full">
                  {characterLabel(char)}
                  <button onClick={() => setCharacterIds(prev => prev.filter(c => c !== id))} className="hover:text-red-300">×</button>
                </span>
              )
            })}
          </div>
          <div className="relative">
            <input
              type="text"
              value={charInput}
              onChange={e => setCharInput(e.target.value)}
              placeholder="Search or add character…"
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-500"
            />
            {charInput.trim().length > 0 && (filteredChars.length > 0 || showCharCreate) && (
              <div className="absolute top-full mt-1 w-full bg-slate-700 rounded-lg shadow-lg z-10 overflow-hidden border border-slate-600">
                {filteredChars.map(char => (
                  <button
                    key={char.id}
                    onMouseDown={e => { e.preventDefault(); addCharacter(char.id!) }}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-600"
                  >
                    {characterLabel(char)}
                  </button>
                ))}
                {showCharCreate && (
                  <button
                    onMouseDown={e => { e.preventDefault(); quickAddCharacter() }}
                    className="w-full text-left px-3 py-2 text-sm text-indigo-300 hover:bg-slate-600"
                  >
                    + Create "{charInput.trim()}"
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Source works */}
        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-300">
            Source works <span className="text-slate-500 font-normal">(direct, no specific character)</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {sourceWorkIds.map(id => {
              const sw = allSourceWorks?.find(s => s.id === id)
              if (!sw) return null
              return (
                <span key={id} className="flex items-center gap-1 px-2 py-1 bg-teal-700 text-white text-xs rounded-full">
                  {sw.name}
                  <button onClick={() => setSourceWorkIds(prev => prev.filter(s => s !== id))} className="hover:text-red-300">×</button>
                </span>
              )
            })}
          </div>
          <div className="relative">
            <input
              type="text"
              value={sourceInput}
              onChange={e => setSourceInput(e.target.value)}
              placeholder="Search or add source work…"
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-500"
            />
            {sourceInput.trim().length > 0 && (filteredSources.length > 0 || showSourceCreate) && (
              <div className="absolute top-full mt-1 w-full bg-slate-700 rounded-lg shadow-lg z-10 overflow-hidden border border-slate-600">
                {filteredSources.map(sw => (
                  <button
                    key={sw.id}
                    onMouseDown={e => { e.preventDefault(); addSourceWork(sw.id!) }}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-600"
                  >
                    {sw.name}
                  </button>
                ))}
                {showSourceCreate && (
                  <button
                    onMouseDown={e => { e.preventDefault(); quickAddSourceWork() }}
                    className="w-full text-left px-3 py-2 text-sm text-indigo-300 hover:bg-slate-600"
                  >
                    + Create "{sourceInput.trim()}"
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Situation tags */}
        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-300">Situation tags</span>
          <div className="flex flex-wrap gap-1.5">
            {situationTags.map(tag => (
              <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-indigo-700 text-white text-xs rounded-full">
                {tag}
                <button onClick={() => setSituationTags(prev => prev.filter(t => t !== tag))} className="hover:text-red-300">×</button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={sitInput}
            onChange={e => setSitInput(e.target.value)}
            onKeyDown={handleSitKeyDown}
            placeholder="Add tag, press Enter or comma…"
            className="bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-500"
          />
        </section>

        <div className="flex gap-2 justify-end pt-1 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-300 hover:text-white">
            Cancel
          </button>
          <button
            onClick={save}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
