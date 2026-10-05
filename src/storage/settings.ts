export type StorageMode = 'local' | 's3'

export interface S3Config {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

export interface AppSettings {
  version: 1
  storageMode: StorageMode
  s3?: S3Config
}

const STORAGE_KEY = 'karansebes:settings'
const DEFAULT_SETTINGS: AppSettings = { version: 1, storageMode: 'local' }

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function getStorageMode(): StorageMode {
  return getSettings().storageMode
}

export function getS3Config(): S3Config | null {
  const settings = getSettings()
  return settings.storageMode === 's3' && settings.s3 ? settings.s3 : null
}
