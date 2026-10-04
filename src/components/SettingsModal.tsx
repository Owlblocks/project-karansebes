import { useEffect, useState } from 'react'
import { isStoragePersisted, requestPersistentStorage } from '../storage/persist'
import { resetAllData, clearLocalData } from '../storage/reset'
import { exportAll } from '../storage/transfer'
import { getSettings, saveSettings, type StorageMode } from '../storage/settings'
import { testS3Connection } from '../storage/s3'

interface Props {
  onClose: () => void
}

const CONFIRM_WORD = 'delete'

export function SettingsModal({ onClose }: Props) {
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)

  const [settings, setSettings] = useState(() => getSettings())
  const [selectedMode, setSelectedMode] = useState<StorageMode>(settings.storageMode)
  const [bucket, setBucket] = useState(settings.s3?.bucket ?? '')
  const [region, setRegion] = useState(settings.s3?.region ?? '')
  const [accessKeyId, setAccessKeyId] = useState(settings.s3?.accessKeyId ?? '')
  const [secretInput, setSecretInput] = useState('')
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [switchConfirmText, setSwitchConfirmText] = useState('')
  const [switching, setSwitching] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<string | null>(null)

  useEffect(() => {
    isStoragePersisted().then(setPersisted)
  }, [])

  function resetTestState() {
    setTestState('idle')
    setTestError('')
  }

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

  const resolvedSecret = secretInput || (settings.s3?.secretAccessKey ?? '')
  const s3FormComplete = bucket.trim() !== '' && region.trim() !== '' && accessKeyId.trim() !== '' && resolvedSecret !== ''

  const isCredentialOnlyUpdate =
    selectedMode === 's3' &&
    settings.storageMode === 's3' &&
    !!settings.s3 &&
    bucket === settings.s3.bucket &&
    region === settings.s3.region

  const hasChanges =
    selectedMode !== settings.storageMode ||
    (selectedMode === 's3' && (
      bucket !== (settings.s3?.bucket ?? '') ||
      region !== (settings.s3?.region ?? '') ||
      secretInput !== '' ||
      accessKeyId !== (settings.s3?.accessKeyId ?? '')
    ))

  const isDestructive = hasChanges && !isCredentialOnlyUpdate

  async function handleTestConnection() {
    setTestState('testing')
    setTestError('')
    const result = await testS3Connection({ bucket, region, accessKeyId, secretAccessKey: resolvedSecret })
    if (result.ok) {
      setTestState('ok')
    } else {
      setTestState('error')
      setTestError(result.message)
    }
  }

  async function handleExportNow() {
    setExporting(true)
    try {
      await exportAll(setExportProgress)
    } catch (err: any) {
      alert(`Export failed: ${err?.message ?? 'Unknown error'}`)
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  async function handleSaveCredentials() {
    const next = {
      version: 1 as const,
      storageMode: 's3' as const,
      s3: { bucket, region, accessKeyId, secretAccessKey: resolvedSecret },
    }
    saveSettings(next)
    setSettings(next)
    setSecretInput('')
    onClose()
  }

  async function handleSwitch() {
    setSwitching(true)
    try {
      await clearLocalData()
      const next =
        selectedMode === 's3'
          ? { version: 1 as const, storageMode: 's3' as const, s3: { bucket, region, accessKeyId, secretAccessKey: resolvedSecret } }
          : { version: 1 as const, storageMode: 'local' as const }
      saveSettings(next)
      window.location.reload()
    } catch (err: any) {
      setSwitching(false)
      alert(`Switch failed: ${err?.message ?? 'Unknown error'}`)
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

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-white">Remote Storage</h3>
            <p className="text-xs text-slate-400">
              Currently active: <span className="font-mono text-slate-200">{settings.storageMode === 's3' ? 'Amazon S3' : 'Local (this device)'}</span>
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => { setSelectedMode('local'); resetTestState() }}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedMode === 'local' ? 'bg-indigo-600 text-white' : 'bg-slate-600 text-slate-300 hover:text-white'}`}
              >
                Local (this device)
              </button>
              <button
                onClick={() => { setSelectedMode('s3'); resetTestState() }}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedMode === 's3' ? 'bg-indigo-600 text-white' : 'bg-slate-600 text-slate-300 hover:text-white'}`}
              >
                Amazon S3
              </button>
            </div>

            {selectedMode === 's3' && (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={bucket}
                  onChange={e => { setBucket(e.target.value); resetTestState() }}
                  placeholder="Bucket name"
                  className="bg-slate-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
                />
                <input
                  type="text"
                  value={region}
                  onChange={e => { setRegion(e.target.value); resetTestState() }}
                  placeholder="Region (e.g. us-east-1)"
                  className="bg-slate-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
                />
                <input
                  type="text"
                  value={accessKeyId}
                  onChange={e => { setAccessKeyId(e.target.value); resetTestState() }}
                  placeholder="Access key ID"
                  className="bg-slate-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
                />
                <input
                  type="password"
                  value={secretInput}
                  onChange={e => { setSecretInput(e.target.value); resetTestState() }}
                  placeholder={settings.s3 ? 'Leave blank to keep the existing secret key' : 'Secret access key'}
                  className="bg-slate-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
                />

                <p className="text-xs text-slate-400">
                  Your bucket needs CORS configured to allow GET/PUT/DELETE from this site's origin, and an IAM user/policy scoped to only this bucket. Credentials are stored only in this browser and sent only to AWS.
                </p>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={!s3FormComplete || testState === 'testing'}
                    className="px-3 py-1.5 bg-slate-500 hover:bg-slate-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {testState === 'testing' ? 'Testing…' : 'Test connection'}
                  </button>
                  {testState === 'ok' && <span className="text-xs text-emerald-400">Connection OK</span>}
                  {testState === 'error' && <span className="text-xs text-red-400">{testError}</span>}
                </div>
              </div>
            )}

            {hasChanges && isCredentialOnlyUpdate && (
              <button
                onClick={handleSaveCredentials}
                disabled={testState !== 'ok'}
                className="self-start px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Save
              </button>
            )}

            {hasChanges && isDestructive && (
              <div className="flex flex-col gap-2 border border-amber-700/50 rounded-lg p-3">
                <p className="text-xs text-amber-300">
                  Switching storage will permanently erase all images, characters, and source works stored on this device. This does not migrate your data automatically — export first, then re-import after switching.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportNow}
                    disabled={exporting}
                    className="px-3 py-1.5 bg-slate-500 hover:bg-slate-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {exporting ? (exportProgress ?? 'Exporting…') : 'Export now'}
                  </button>
                </div>
                <label className="text-xs text-slate-400">
                  Type <span className="font-mono text-slate-200">{CONFIRM_WORD}</span> to confirm.
                </label>
                <input
                  type="text"
                  value={switchConfirmText}
                  onChange={e => setSwitchConfirmText(e.target.value)}
                  placeholder={CONFIRM_WORD}
                  className="bg-slate-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400"
                />
                <button
                  onClick={handleSwitch}
                  disabled={
                    switchConfirmText !== CONFIRM_WORD ||
                    switching ||
                    (selectedMode === 's3' && testState !== 'ok')
                  }
                  className="self-start px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {switching ? 'Switching…' : 'Switch storage'}
                </button>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2 border border-red-900/50 rounded-lg p-3">
            <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
            <p className="text-xs text-slate-400">
              {settings.storageMode === 's3'
                ? 'This permanently deletes all images, characters, and source works from this device, and empties the catalog in your S3 bucket so they won\'t be restored. Image files already in the bucket are left in place but will no longer appear in the app. This cannot be undone.'
                : 'This permanently deletes all images, characters, and source works from this device. This cannot be undone.'}
            </p>
            <label className="text-xs text-slate-400">
              Type <span className="font-mono text-slate-200">{CONFIRM_WORD}</span> to confirm.
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              className="bg-slate-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500 placeholder:text-slate-400"
            />
            <button
              onClick={handleReset}
              disabled={confirmText !== CONFIRM_WORD || resetting}
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
