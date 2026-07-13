import { useRef } from 'react'
import { useFileImport } from '../hooks/useFileImport'

export function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { importing, progress, handleFiles } = useFileImport()

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.zip,application/zip"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ''
        }}
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
