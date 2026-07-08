import { useRef, useState } from 'react'
import { db } from '../db/database'
import { saveImageToOPFS, generateThumbnail, hashBuffer } from '../storage/opfs'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  async function handleFiles(files: FileList) {
    const imageFiles = Array.from(files).filter(f => ACCEPTED_TYPES.includes(f.type))
    if (imageFiles.length === 0) return

    setImporting(true)
    let skipped = 0

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      setProgress(`Importing ${i + 1} / ${imageFiles.length}`)
      try {
        const buffer = await file.arrayBuffer()
        const contentHash = await hashBuffer(buffer)

        const existing = await db.images.get(contentHash)
        if (existing) {
          skipped++
          continue
        }

        const ext = EXT_MAP[file.type] ?? 'bin'
        const [opfsPath, thumbnailDataUrl] = await Promise.all([
          saveImageToOPFS(buffer, ext),
          generateThumbnail(buffer, file.type),
        ])

        await db.images.add({
          opfsPath,
          thumbnailDataUrl,
          mimeType: file.type,
          createdAt: new Date(),
          contentHash,
          imageText: null,
          characterIds: [],
          sourceWorkIds: [],
          situationTags: [],
        })
      } catch (err) {
        console.error(`Failed to import ${file.name}:`, err)
      }
    }

    setImporting(false)
    setProgress(null)
    if (skipped > 0) alert(`${skipped} duplicate${skipped > 1 ? 's' : ''} skipped.`)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
      >
        {importing ? (progress ?? 'Importing…') : 'Import Images'}
      </button>
    </>
  )
}
