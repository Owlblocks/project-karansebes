import { useState, type KeyboardEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ImageRecord, type Character } from '../db/database'
import { SearchableEntityPicker, TagChip } from './SearchableEntityPicker'

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
          alt=""
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
        <SearchableEntityPicker
          label="Characters"
          selectedItems={characterIds.flatMap(id => {
            const char = allCharacters?.find(c => c.id === id)
            return char ? [{ id, label: characterLabel(char) }] : []
          })}
          onRemove={id => setCharacterIds(prev => prev.filter(c => c !== id))}
          searchResults={filteredChars.map(c => ({ id: c.id!, label: characterLabel(c) }))}
          inputValue={charInput}
          onInputChange={setCharInput}
          onSelect={addCharacter}
          showCreate={showCharCreate}
          createLabel={charInput.trim()}
          onCreate={quickAddCharacter}
          chipColor="bg-violet-700"
          placeholder="Search or add character…"
        />

        {/* Source works */}
        <SearchableEntityPicker
          label="Source works"
          labelHint="direct, no specific character"
          selectedItems={sourceWorkIds.flatMap(id => {
            const sw = allSourceWorks?.find(s => s.id === id)
            return sw ? [{ id, label: sw.name }] : []
          })}
          onRemove={id => setSourceWorkIds(prev => prev.filter(s => s !== id))}
          searchResults={filteredSources.map(sw => ({ id: sw.id!, label: sw.name }))}
          inputValue={sourceInput}
          onInputChange={setSourceInput}
          onSelect={addSourceWork}
          showCreate={showSourceCreate}
          createLabel={sourceInput.trim()}
          onCreate={quickAddSourceWork}
          chipColor="bg-teal-700"
          placeholder="Search or add source work…"
        />

        {/* Situation tags */}
        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-300">Situation tags</span>
          <div className="flex flex-wrap gap-1.5">
            {situationTags.map(tag => (
              <TagChip key={tag} label={tag} onRemove={() => setSituationTags(prev => prev.filter(t => t !== tag))} chipColor="bg-indigo-700" />
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
