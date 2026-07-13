import { useState } from 'react'
import { exportAll } from '../storage/transfer'

export function ExportButton() {
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    try {
      await exportAll(setProgress)
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed. See console for details.')
    } finally {
      setExporting(false)
      setProgress(null)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="px-2 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 hover:text-white rounded-lg text-sm font-medium transition-colors shrink-0"
    >
      {exporting ? (progress ?? 'Exporting…') : (
        <>
          <span className="sm:hidden">📤</span>
          <span className="hidden sm:inline">Export</span>
        </>
      )}
    </button>
  )
}
