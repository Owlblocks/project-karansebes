import { vi } from 'vitest'
import type { Manifest } from '../storage/manifest'

// Drop-in replacement for src/storage/s3.ts, used via:
//   vi.mock('./s3', () => import('../test/fakeS3'))

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
  /** Image objects by key. */
  objects: new Map<string, { bytes: Uint8Array; contentType: string }>(),

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
    this.objects = new Map()
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

export const saveImageToS3 = vi.fn(
  async (buffer: ArrayBuffer, contentHash: string, ext: string, mimeType: string): Promise<string> => {
    const key = `images/${contentHash}.${ext}`
    bucket.objects.set(key, { bytes: new Uint8Array(buffer.slice(0)), contentType: mimeType })
    return key
  },
)

export const getImageFileFromS3 = vi.fn(async (key: string): Promise<File> => {
  const obj = bucket.objects.get(key)
  if (!obj) throw Object.assign(new Error(`NoSuchKey: ${key}`), { name: 'NoSuchKey' })
  return new File([obj.bytes as Uint8Array<ArrayBuffer>], key.split('/').pop()!, { type: obj.contentType })
})

export const deleteImageFromS3 = vi.fn(async (key: string): Promise<void> => {
  bucket.objects.delete(key)
})

export const testS3Connection = vi.fn(async () => ({ ok: true as const }))
