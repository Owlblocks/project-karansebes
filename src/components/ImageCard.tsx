import { useState } from 'react'
import { db, type ImageRecord } from '../db/database'
import { deleteImageFromOPFS } from '../storage/opfs'
import { TagEditor } from './TagEditor'

interface Props {
  image: ImageRecord
}

export function ImageCard({ image }: Props) {
  const [editing, setEditing] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete "${image.filename}"?`)) return
    await deleteImageFromOPFS(image.opfsPath)
    await db.images.delete(image.id!)
  }

  return (
    <>
      <div className="group relative bg-slate-800 rounded-xl overflow-hidden flex flex-col">
        <button
          onClick={() => setEditing(true)}
          className="block w-full aspect-square overflow-hidden bg-slate-900"
        >
          <img
            src={image.thumbnailDataUrl}
            alt={image.filename}
            className="w-full h-full object-contain transition-transform group-hover:scale-105"
          />
        </button>

        <div className="p-2 flex flex-col gap-1">
          <p className="text-xs text-slate-400 truncate">{image.filename}</p>
          <div className="flex flex-wrap gap-1">
            {image.tags.length === 0 ? (
              <span className="text-xs text-slate-600 italic">no tags</span>
            ) : (
              image.tags.map(tag => (
                <span key={tag} className="text-xs bg-indigo-900 text-indigo-200 px-1.5 py-0.5 rounded-full">
                  {tag}
                </span>
              ))
            )}
          </div>
        </div>

        <button
          onClick={handleDelete}
          className="absolute top-2 right-2 w-6 h-6 bg-black/60 hover:bg-red-600 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          title="Delete"
        >
          ×
        </button>
      </div>

      {editing && <TagEditor image={image} onClose={() => setEditing(false)} />}
    </>
  )
}
