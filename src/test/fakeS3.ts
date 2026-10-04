import { vi } from 'vitest'
import type { Manifest } from '../storage/manifest'

// Drop-in replacement for src/storage/s3.ts, used via:
//   vi.mock('./s3', () => import('../test/fakeS3'))
// Only the manifest functions are faked; the image functions throw if reached.

interface Pending {
  resolve(): void
  reject(err: unknown): void
}

export const bucket = {
  /** The stored manifest.json, kept as JSON text as on S3. */
  manifestJson: null as string | null,
  /** Every manifest PUT in the order it was sent (not the order it landed). */
  puts: [] as Manifest[],
  inFlight: 0,
  maxInFlight: 0,
  /** When set, each PUT stays pending until a test settles it via `pending`. */
  holdPuts: false,
  pending: [] as Pending[],
  /** When set, fetching the manifest throws this error. */
  getError: null as Error | null,

  get manifest(): Manifest | null {
    return this.manifestJson ? JSON.parse(this.manifestJson) : null
  },

  reset() {
    this.manifestJson = null
    this.puts = []
    this.inFlight = 0
    this.maxInFlight = 0
    this.holdPuts = false
    this.pending = []
    this.getError = null
  },
}

export const putManifestToS3 = vi.fn(async (manifest: unknown): Promise<void> => {
  const json = JSON.stringify(manifest)
  bucket.puts.push(JSON.parse(json))
  bucket.inFlight++
  bucket.maxInFlight = Math.max(bucket.maxInFlight, bucket.inFlight)
  try {
    if (bucket.holdPuts) {
      await new Promise<void>((resolve, reject) => bucket.pending.push({ resolve, reject }))
    }
    bucket.manifestJson = json
  } finally {
    bucket.inFlight--
  }
})

export const getManifestFromS3 = vi.fn(async (): Promise<any> => {
  if (bucket.getError) throw bucket.getError
  return bucket.manifest
})

function notFaked(name: string) {
  return vi.fn(async (..._args: unknown[]): Promise<any> => {
    throw new Error(`fakeS3: ${name} is not faked`)
  })
}

export const saveImageToS3 = notFaked('saveImageToS3')
export const getImageFileFromS3 = notFaked('getImageFileFromS3')
export const deleteImageFromS3 = notFaked('deleteImageFromS3')
export const testS3Connection = notFaked('testS3Connection')
