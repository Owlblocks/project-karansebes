import { useState } from 'react'
import { db, type ImageRecord, type Character, type SourceWork } from '../db/database'
import { deleteImageFromOPFS } from '../storage/opfs'
import { TagEditor } from './TagEditor'

interface Props {
  image: ImageRecord
  characters: Character[]
  sourceWorks: SourceWork[]
}

export function ImageCard({ image, characters, sourceWorks }: Props) {
  const [editing, setEditing] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete this image?')) return
    await deleteImageFromOPFS(image.opfsPath)
    await db.images.delete(image.contentHash)
  }

  const imageChars = image.characterIds
    .map(id => characters.find(c => c.id === id))
    .filter(Boolean) as Character[]

  const directSourceWorks = image.characterIds.length === 0
    ? image.sourceWorkIds.map(id => sourceWorks.find(sw => sw.id === id)).filter(Boolean) as SourceWork[]
    : []

  return (
    <>
      <div className="group relative bg-slate-800 rounded-xl overflow-hidden flex flex-col">
        <button
          onClick={() => setEditing(true)}
          className="block w-full aspect-square overflow-hidden bg-slate-900"
        >
          <img
            src={image.thumbnailDataUrl}
            alt=""
            className="w-full h-full object-contain transition-transform group-hover:scale-105"
          />
        </button>

        {image.imageText === null && (
          <span
            className="absolute top-2 left-2 bg-amber-500/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded"
            title="Image text not yet checked"
          >
            unchecked
          </span>
        )}

        <div className="p-2 flex flex-col gap-1">
          {image.notes && <p className="text-xs text-slate-500 truncate">{image.notes}</p>}
          <div className="flex flex-wrap gap-1">
            {imageChars.map(char => (
              <span key={char.id} className="text-xs bg-violet-900 text-violet-200 px-1.5 py-0.5 rounded-full">
                {char.name}
              </span>
            ))}
            {directSourceWorks.map(sw => (
              <span key={sw.id} className="text-xs bg-teal-900 text-teal-200 px-1.5 py-0.5 rounded-full">
                {sw.name}
              </span>
            ))}
            {image.situationTags.map(tag => (
              <span key={tag} className="text-xs bg-indigo-900 text-indigo-200 px-1.5 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
            {imageChars.length === 0 && directSourceWorks.length === 0 && image.situationTags.length === 0 && (
              <span className="text-xs text-slate-600 italic">no tags</span>
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
