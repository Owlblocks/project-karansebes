import { useEffect, useRef, useState } from 'react'
import { type ImageRecord } from '../db/database'
import { getImageFile } from '../storage/opfs'

interface Props {
  image: ImageRecord
  onClose: () => void
}

export function ImageViewer({ image, onClose }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getImageFile(image.opfsPath).then(file => {
      if (cancelled) return
      const url = URL.createObjectURL(file)
      urlRef.current = url
      setSrc(url)
    })
    return () => {
      cancelled = true
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [image.opfsPath])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center bg-black/60 hover:bg-slate-700 text-white rounded-full text-xl leading-none"
        aria-label="Close"
      >
        ×
      </button>
      {src ? (
        <img
          src={src}
          alt=""
          className="max-w-full max-h-full object-contain"
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <div className="text-white/40 text-sm">Loading…</div>
      )}
    </div>
  )
}
