import { useEffect, useState } from 'react'
import { isStoragePersisted, requestPersistentStorage } from '../storage/persist'
import { resetAllData } from '../storage/reset'

interface Props {
  onClose: () => void
}

const RESET_CONFIRM_WORD = 'delete'

export function SettingsModal({ onClose }: Props) {
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    isStoragePersisted().then(setPersisted)
  }, [])

  async function handleRequestPersist() {
    setRequesting(true)
    await requestPersistentStorage()
    setPersisted(await isStoragePersisted())
    setRequesting(false)
  }

  async function handleReset() {
    setResetting(true)
    try {
      await resetAllData()
      onClose()
    } finally {
      setResetting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 rounded-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <h2 className="text-base font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="bg-slate-700 rounded-xl mx-2 mb-2 flex-1 overflow-y-auto p-4 flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-white">Storage</h3>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${persisted ? 'bg-emerald-500' : 'bg-amber-500'}`}
              />
              {persisted === null ? 'Checking…' : persisted ? 'Storage is persisted' : 'Storage is not persisted'}
            </div>
            <p className="text-xs text-slate-400">
              {persisted
                ? 'This data is protected from automatic eviction by the browser.'
                : 'The browser may clear this data if the device runs low on space. Granting persistent storage once is usually enough to protect it going forward.'}
            </p>
            {!persisted && (
              <button
                onClick={handleRequestPersist}
                disabled={requesting}
                className="self-start px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {requesting ? 'Requesting…' : 'Request persistent storage'}
              </button>
            )}
          </section>

          <section className="flex flex-col gap-2 border border-red-900/50 rounded-lg p-3">
            <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
            <p className="text-xs text-slate-400">
              This permanently deletes all images, characters, and source works from this device. This cannot be undone.
            </p>
            <label className="text-xs text-slate-400">
              Type <span className="font-mono text-slate-200">{RESET_CONFIRM_WORD}</span> to confirm.
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={RESET_CONFIRM_WORD}
              className="bg-slate-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500 placeholder:text-slate-400"
            />
            <button
              onClick={handleReset}
              disabled={confirmText !== RESET_CONFIRM_WORD || resetting}
              className="self-start px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {resetting ? 'Resetting…' : 'Reset database'}
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
