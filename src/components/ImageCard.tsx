import { useRef, useState } from 'react'
import { db, type ImageRecord, type Character, type SourceWork } from '../db/database'
import { deleteImageFromOPFS, getImageFile } from '../storage/opfs'
import { TagEditor } from './TagEditor'
import { ImageViewer } from './ImageViewer'

interface Props {
  image: ImageRecord
  characters: Character[]
  sourceWorks: SourceWork[]
}

const isTouchDevice = window.matchMedia('(pointer: coarse)').matches

export function ImageCard({ image, characters, sourceWorks }: Props) {
  const [editing, setEditing] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressDidFire = useRef(false)
  const didMove = useRef(false)

  async function handleDelete() {
    if (!confirm('Delete this image?')) return
    await deleteImageFromOPFS(image.opfsPath)
    await db.images.delete(image.contentHash)
  }

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const file = await getImageFile(image.opfsPath)
      await navigator.clipboard.write([new ClipboardItem({ [image.mimeType]: file })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyFailed(true)
      setTimeout(() => setCopyFailed(false), 2500)
    }
  }

  function handleTouchStart() {
    longPressDidFire.current = false
    didMove.current = false
    longPressTimer.current = setTimeout(() => {
      longPressDidFire.current = true
      setEditing(true)
    }, 500)
  }

  function handleTouchMove() {
    didMove.current = true
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (didMove.current || longPressDidFire.current) return
    e.preventDefault()
    setViewing(true)
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
          onClick={isTouchDevice ? undefined : () => setEditing(true)}
          onTouchStart={isTouchDevice ? handleTouchStart : undefined}
          onTouchMove={isTouchDevice ? handleTouchMove : undefined}
          onTouchEnd={isTouchDevice ? handleTouchEnd : undefined}
          className="block w-full aspect-square overflow-hidden bg-slate-900"
        >
          <img
            src={image.thumbnailDataUrl}
            alt=""
            draggable={false}
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

        {!isTouchDevice && (
          <button
            onClick={handleCopy}
            className={`absolute top-2 right-9 w-6 h-6 rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center ${copyFailed ? 'bg-amber-600 text-white opacity-100' : 'bg-black/60 hover:bg-slate-600 text-white'}`}
            title={copied ? 'Copied!' : copyFailed ? 'Copy not supported in this browser' : 'Copy image'}
          >
            {copied ? '✓' : copyFailed ? '!' : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        )}

        <button
          onClick={handleDelete}
          className="absolute top-2 right-2 w-6 h-6 bg-black/60 hover:bg-red-600 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          title="Delete"
        >
          ×
        </button>
      </div>

      {viewing && <ImageViewer image={image} onClose={() => setViewing(false)} />}
      {editing && <TagEditor image={image} onClose={() => setEditing(false)} />}
    </>
  )
}
