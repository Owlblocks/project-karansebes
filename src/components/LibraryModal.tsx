import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Character, type SourceWork } from '../db/database'
import { TagChip } from './SearchableEntityPicker'

type Tab = 'characters' | 'sourceWorks'

interface Props {
  onClose: () => void
}

// ── Shared local components ───────────────────────────────────────────────────

function AddItemInput({ value, onChange, onAdd, placeholder }: {
  value: string
  onChange: (v: string) => void
  onAdd: () => void
  placeholder: string
}) {
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onAdd()}
        placeholder={placeholder}
        className="flex-1 bg-slate-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
      />
      <button
        onClick={onAdd}
        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
      >
        Add
      </button>
    </div>
  )
}

function EntityRow({ label, onEdit, onDelete }: {
  label: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-white">{label}</span>
      <div className="flex gap-2">
        <button onClick={onEdit} className="text-xs text-slate-400 hover:text-white">Edit</button>
        <button onClick={onDelete} className="text-xs text-slate-400 hover:text-red-400">Delete</button>
      </div>
    </div>
  )
}

// ── LibraryModal ──────────────────────────────────────────────────────────────

export function LibraryModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('characters')

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 rounded-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <h2 className="text-base font-semibold text-white">Library</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex gap-1 px-6 shrink-0">
          {(['characters', 'sourceWorks'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm rounded-t-lg font-medium transition-colors ${
                tab === t
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t === 'characters' ? 'Characters' : 'Source Works'}
            </button>
          ))}
        </div>

        <div className="bg-slate-700 rounded-xl mx-2 mb-2 flex-1 overflow-y-auto p-4">
          {tab === 'characters' ? <CharactersPanel /> : <SourceWorksPanel />}
        </div>
      </div>
    </div>
  )
}

// ── Source Works ──────────────────────────────────────────────────────────────

function SourceWorksPanel() {
  const allSourceWorks = useLiveQuery(() => db.sourceWorks.orderBy('name').toArray(), [])
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  async function addSourceWork() {
    const name = newName.trim()
    if (!name) return
    await db.sourceWorks.add({ id: crypto.randomUUID(), name })
    setNewName('')
  }

  async function saveSourceWork() {
    if (!editing) return
    const { id, name } = editing
    if (!name.trim()) return
    await db.sourceWorks.update(id, { name: name.trim() })
    setEditing(null)
  }

  async function deleteSourceWork(sw: SourceWork) {
    if (!confirm(`Delete "${sw.name}"? It will be removed from all characters and images.`)) return
    await db.transaction('rw', db.sourceWorks, db.characters, db.images, async () => {
      await db.sourceWorks.delete(sw.id!)
      const chars = await db.characters.where('sourceWorkIds').equals(sw.id!).toArray()
      for (const char of chars) {
        await db.characters.update(char.id!, {
          sourceWorkIds: char.sourceWorkIds.filter(id => id !== sw.id),
        })
      }
      const imgs = await db.images.where('sourceWorkIds').equals(sw.id!).toArray()
      for (const img of imgs) {
        await db.images.update(img.contentHash, {
          sourceWorkIds: img.sourceWorkIds.filter(id => id !== sw.id),
        })
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <AddItemInput value={newName} onChange={setNewName} onAdd={addSourceWork} placeholder="New source work…" />

      {(allSourceWorks ?? []).length === 0 && (
        <p className="text-sm text-slate-500 italic">No source works yet.</p>
      )}

      <ul className="flex flex-col gap-1">
        {(allSourceWorks ?? []).map(sw => (
          <li key={sw.id} className="bg-slate-600 rounded-lg px-3 py-2">
            {editing?.id === sw.id ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editing!.name}
                  onChange={e => setEditing(ed => ed ? { ...ed, name: e.target.value } : null)}
                  onKeyDown={e => { if (e.key === 'Enter') saveSourceWork(); if (e.key === 'Escape') setEditing(null) }}
                  autoFocus
                  className="flex-1 bg-slate-500 text-white rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onClick={saveSourceWork} className="text-sm text-indigo-300 hover:text-white">Save</button>
                <button onClick={() => setEditing(null)} className="text-sm text-slate-400 hover:text-white">Cancel</button>
              </div>
            ) : (
              <EntityRow
                label={sw.name}
                onEdit={() => setEditing({ id: sw.id!, name: sw.name })}
                onDelete={() => deleteSourceWork(sw)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Characters ────────────────────────────────────────────────────────────────

interface EditingChar {
  id: string
  name: string
  sourceWorkIds: string[]
  sourceInput: string
}

function CharactersPanel() {
  const allCharacters = useLiveQuery(() => db.characters.orderBy('name').toArray(), [])
  const allSourceWorks = useLiveQuery(() => db.sourceWorks.orderBy('name').toArray(), [])
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<EditingChar | null>(null)
  const [noSourceOnly, setNoSourceOnly] = useState(false)

  function sourceWorkName(id: string) {
    return allSourceWorks?.find(sw => sw.id === id)?.name ?? '?'
  }

  function characterLabel(char: Character) {
    if (!allSourceWorks || char.sourceWorkIds.length === 0) return char.name
    const sources = char.sourceWorkIds.map(id => sourceWorkName(id)).join(', ')
    return `${char.name} (${sources})`
  }

  async function addCharacter() {
    const name = newName.trim()
    if (!name) return
    await db.characters.add({ id: crypto.randomUUID(), name, sourceWorkIds: [] })
    setNewName('')
  }

  async function saveCharacter() {
    if (!editing) return
    const { id, name, sourceWorkIds } = editing
    if (!name.trim()) return
    await db.characters.update(id, { name: name.trim(), sourceWorkIds })
    setEditing(null)
  }

  async function deleteCharacter(char: Character) {
    if (!confirm(`Delete "${char.name}"? It will be removed from all images.`)) return
    await db.transaction('rw', db.characters, db.images, async () => {
      await db.characters.delete(char.id!)
      const imgs = await db.images.where('characterIds').equals(char.id!).toArray()
      for (const img of imgs) {
        await db.images.update(img.contentHash, {
          characterIds: img.characterIds.filter(id => id !== char.id),
        })
      }
    })
  }

  const availableSources = (allSourceWorks ?? []).filter(sw =>
    !editing?.sourceWorkIds.includes(sw.id!) &&
    sw.name.toLowerCase().includes((editing?.sourceInput ?? '').toLowerCase())
  )
  const showSourceDropdown = (editing?.sourceInput.trim().length ?? 0) > 0 && availableSources.length > 0

  const visibleCharacters = noSourceOnly
    ? (allCharacters ?? []).filter(c => c.sourceWorkIds.length === 0)
    : (allCharacters ?? [])

  return (
    <div className="flex flex-col gap-3">
      <AddItemInput value={newName} onChange={setNewName} onAdd={addCharacter} placeholder="New character…" />

      <button
        onClick={() => setNoSourceOnly(v => !v)}
        className={`self-start px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${noSourceOnly ? 'bg-amber-500 text-white hover:bg-amber-400' : 'bg-slate-500 text-slate-300 hover:text-white'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 inline-block mr-1"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        No source work
      </button>

      {visibleCharacters.length === 0 && (
        <p className="text-sm text-slate-500 italic">
          {noSourceOnly ? 'All characters have a source work.' : 'No characters yet.'}
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {visibleCharacters.map(char => (
          <li key={char.id} className="bg-slate-600 rounded-lg px-3 py-2">
            {editing?.id === char.id ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={editing!.name}
                  onChange={e => setEditing(ed => ed ? { ...ed, name: e.target.value } : null)}
                  onKeyDown={e => e.key === 'Escape' && setEditing(null)}
                  autoFocus
                  className="bg-slate-500 text-white rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex flex-wrap gap-1">
                  {editing!.sourceWorkIds.map(id => (
                    <TagChip
                      key={id}
                      label={sourceWorkName(id)}
                      onRemove={() => setEditing(ed => ed ? { ...ed, sourceWorkIds: ed.sourceWorkIds.filter(s => s !== id) } : null)}
                      chipColor="bg-teal-700"
                    />
                  ))}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={editing!.sourceInput}
                    onChange={e => setEditing(ed => ed ? { ...ed, sourceInput: e.target.value } : null)}
                    placeholder="Link a source work…"
                    className="w-full bg-slate-500 text-white rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
                  />
                  {showSourceDropdown && (
                    <div className="absolute top-full mt-1 w-full bg-slate-500 rounded-lg shadow-lg z-10 overflow-hidden border border-slate-400">
                      {availableSources.map(sw => (
                        <button
                          key={sw.id}
                          onMouseDown={e => {
                            e.preventDefault()
                            setEditing(ed => ed ? { ...ed, sourceWorkIds: [...ed.sourceWorkIds, sw.id!], sourceInput: '' } : null)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-400"
                        >
                          {sw.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditing(null)} className="text-sm text-slate-400 hover:text-white">Cancel</button>
                  <button onClick={saveCharacter} className="text-sm text-indigo-300 hover:text-white">Save</button>
                </div>
              </div>
            ) : (
              <EntityRow
                label={characterLabel(char)}
                onEdit={() => setEditing({ id: char.id!, name: char.name, sourceWorkIds: char.sourceWorkIds, sourceInput: '' })}
                onDelete={() => deleteCharacter(char)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
