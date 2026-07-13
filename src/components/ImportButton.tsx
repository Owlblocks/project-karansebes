import { useRef, useState } from 'react'
import { db } from '../db/database'
import { saveImageToOPFS, generateThumbnail, hashBuffer } from '../storage/opfs'
import { importFromZip } from '../storage/transfer'

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
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
    const allFiles = Array.from(files)
    if (allFiles.length === 0) return

    setImporting(true)

    const zipFiles = allFiles.filter(f => f.name.endsWith('.zip') || f.type === 'application/zip')
    const imageFiles = allFiles.filter(f => ACCEPTED_IMAGE_TYPES.includes(f.type))

    for (const zip of zipFiles) {
      try {
        const result = await importFromZip(zip, setProgress)
        const parts = [`${result.imagesAdded} image${result.imagesAdded !== 1 ? 's' : ''} added`]
        if (result.imagesSkipped > 0) parts.push(`${result.imagesSkipped} skipped`)
        if (result.charactersAdded > 0) parts.push(`${result.charactersAdded} new character${result.charactersAdded !== 1 ? 's' : ''}`)
        if (result.sourceWorksAdded > 0) parts.push(`${result.sourceWorksAdded} new source work${result.sourceWorksAdded !== 1 ? 's' : ''}`)
        alert(parts.join(', ') + '.')
      } catch (err: any) {
        console.error('ZIP import failed:', err)
        alert(`Import failed: ${err?.message ?? 'Unknown error'}`)
      }
    }

    if (imageFiles.length > 0) {
      let skipped = 0
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i]
        setProgress(`Importing ${i + 1} / ${imageFiles.length}`)
        try {
          const buffer = await file.arrayBuffer()
          const contentHash = await hashBuffer(buffer)

          const existing = await db.images.get(contentHash)
          if (existing) { skipped++; continue }

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
      if (skipped > 0) alert(`${skipped} duplicate${skipped > 1 ? 's' : ''} skipped.`)
    }

    setImporting(false)
    setProgress(null)
    // Reset so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.zip,application/zip"
        multiple
        className="hidden"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        className="px-2 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
      >
        {importing ? (progress ?? 'Importing…') : (
          <>
            <span className="sm:hidden">📥</span>
            <span className="hidden sm:inline">Import</span>
          </>
        )}
      </button>
    </>
  )
}
