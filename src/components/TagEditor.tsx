import { useState, type KeyboardEvent } from 'react'
import { db, type ImageRecord } from '../db/database'

interface Props {
  image: ImageRecord
  onClose: () => void
}

export function TagEditor({ image, onClose }: Props) {
  const [tags, setTags] = useState<string[]>(image.tags)
  const [input, setInput] = useState('')

  function addTag() {
    const tag = input.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags(prev => [...prev, tag])
    }
    setInput('')
  }

  function removeTag(tag: string) {
    setTags(prev => prev.filter(t => t !== tag))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag()
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      setTags(prev => prev.slice(0, -1))
    }
  }

  async function save() {
    await db.images.update(image.id!, { tags })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md flex flex-col gap-4">
        <img
          src={image.thumbnailDataUrl}
          alt={image.filename}
          className="w-full max-h-48 object-contain rounded-lg bg-slate-900"
        />
        <div className="flex flex-wrap gap-2 min-h-8">
          {tags.map(tag => (
            <span
              key={tag}
              className="flex items-center gap-1 px-2 py-1 bg-indigo-700 text-white text-xs rounded-full"
            >
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-red-300">×</button>
            </span>
          ))}
        </div>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add tag, press Enter or comma"
          className="bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
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
