import { useRef, useState } from 'react'
import { db } from '../db/database'
import { saveImageToOPFS, generateThumbnail } from '../storage/opfs'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  async function handleFiles(files: FileList) {
    const imageFiles = Array.from(files).filter(f => ACCEPTED_TYPES.includes(f.type))
    if (imageFiles.length === 0) return

    setImporting(true)
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      setProgress(`Importing ${i + 1} / ${imageFiles.length}`)
      try {
        const [opfsPath, thumbnailDataUrl] = await Promise.all([
          saveImageToOPFS(file),
          generateThumbnail(file),
        ])
        await db.images.add({
          filename: file.name,
          opfsPath,
          tags: [],
          createdAt: new Date(),
          mimeType: file.type,
          thumbnailDataUrl,
        })
      } catch (err) {
        console.error(`Failed to import ${file.name}:`, err)
      }
    }
    setImporting(false)
    setProgress(null)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
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
