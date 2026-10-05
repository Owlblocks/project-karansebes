import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { db } from '../db/database'
import { bucket, saveImageToS3 } from '../test/fakeS3'
import { clearTables, makeImage, seed, SETTLE_MS, sleep, useS3Mode } from '../test/helpers'
import type { Manifest, ManifestImage } from './manifest'
import { importFromZip, importImageFiles } from './transfer'

vi.mock('./s3', () => import('../test/fakeS3'))
// Node can't decode images, so thumbnails are faked; hashBuffer stays real.
vi.mock('./opfs', async importOriginal => ({
  ...(await importOriginal<typeof import('./opfs')>()),
  generateThumbnail: vi.fn(async (_buffer: ArrayBuffer, mimeType: string) => `data:thumb;${mimeType}`),
}))

let consoleError: MockInstance

beforeEach(async () => {
  useS3Mode()
  bucket.reset()
  await clearTables()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  await sleep(SETTLE_MS)
  await vi.waitFor(() => expect(bucket.inFlight).toBe(0))
})

function manifestImage(contentHash: string, overrides: Partial<ManifestImage> = {}): ManifestImage {
  const { thumbnailDataUrl: _, ...img } = makeImage({ contentHash })
  return { ...img, opfsPath: `${crypto.randomUUID()}.png`, ...overrides }
}

function zipFile(
  data: Pick<Manifest, 'images' | 'characters' | 'sourceWorks'>,
  imageBytes: Record<string, string> = Object.fromEntries(data.images.map(img => [img.contentHash, `bytes-${img.contentHash}`])),
): File {
  const manifest: Manifest = { version: 1, exportedAt: '2026-01-01T00:00:00.000Z', ...data }
  const entries: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify(manifest)) }
  for (const [hash, bytes] of Object.entries(imageBytes)) entries[`images/${hash}`] = strToU8(bytes)
  return new File([zipSync(entries) as Uint8Array<ArrayBuffer>], 'export.zip', { type: 'application/zip' })
}

const hashes = (m: Manifest | null) => m?.images.map(i => i.contentHash).sort()

describe('importFromZip in S3 mode', () => {
  it('uploads each image to S3, stores its key, and syncs the manifest once at the end', async () => {
    const result = await importFromZip(zipFile({
      images: [manifestImage('aaa'), manifestImage('bbb', { mimeType: 'image/gif', opfsPath: 'x.gif' })],
      characters: [],
      sourceWorks: [],
    }))

    expect(result).toMatchObject({ imagesAdded: 2, imagesSkipped: 0, imagesFailed: 0 })
    expect(await db.images.get('aaa')).toMatchObject({ opfsPath: 'images/aaa.png', thumbnailDataUrl: 'data:thumb;image/png' })
    expect(await db.images.get('bbb')).toMatchObject({ opfsPath: 'images/bbb.gif', thumbnailDataUrl: 'data:thumb;image/gif' })
    expect(new TextDecoder().decode(bucket.objects.get('images/aaa.png')!.bytes)).toBe('bytes-aaa')
    expect(bucket.objects.get('images/bbb.gif')!.contentType).toBe('image/gif')

    await vi.waitFor(() => expect(bucket.inFlight === 0 && bucket.puts.length > 0).toBe(true))
    await sleep(SETTLE_MS)
    expect(bucket.puts).toHaveLength(1)
    expect(hashes(bucket.manifest)).toEqual(['aaa', 'bbb'])
    // The manifest records the S3 key, not the exporting device's OPFS filename.
    expect(bucket.manifest!.images.find(i => i.contentHash === 'aaa')!.opfsPath).toBe('images/aaa.png')
  })

  it('counts a failed S3 upload without aborting the rest of the import', async () => {
    vi.mocked(saveImageToS3).mockRejectedValueOnce(new Error('AccessDenied'))

    const result = await importFromZip(zipFile({
      images: [manifestImage('aaa'), manifestImage('bbb')],
      characters: [],
      sourceWorks: [],
    }))

    expect(result).toMatchObject({ imagesAdded: 1, imagesFailed: 1 })
    expect(await db.images.get('aaa')).toBeUndefined()
    await vi.waitFor(() => expect(hashes(bucket.manifest)).toEqual(['bbb']))
    expect(consoleError).toHaveBeenCalledWith('Failed to import image aaa:', expect.any(Error))
  })

  it('skips images already present locally and images whose bytes are missing from the zip', async () => {
    await seed({ images: [makeImage({ contentHash: 'aaa' })] })

    const result = await importFromZip(zipFile(
      { images: [manifestImage('aaa'), manifestImage('bbb')], characters: [], sourceWorks: [] },
      { aaa: 'bytes-aaa' },
    ))

    expect(result).toMatchObject({ imagesAdded: 0, imagesSkipped: 2 })
    expect(saveImageToS3).not.toHaveBeenCalled()
  })

  it('still syncs whatever it wrote when the import fails partway', async () => {
    const broken = { id: 'c1', name: 'Alice' } as unknown as Manifest['characters'][number] // no sourceWorkIds

    await expect(importFromZip(zipFile({
      images: [],
      characters: [broken],
      sourceWorks: [{ id: 'sw1', name: 'Work One' }],
    }))).rejects.toThrow()

    expect(await db.sourceWorks.count()).toBe(1)
    await vi.waitFor(() => expect(bucket.manifest?.sourceWorks).toEqual([{ id: 'sw1', name: 'Work One' }]))
  })

  it('merges into existing source works and characters by name, remapping image references', async () => {
    await seed({
      sourceWorks: [{ id: 'local-sw', name: 'Work One' }],
      characters: [{ id: 'local-c', name: 'Alice', sourceWorkIds: ['local-sw'] }],
    })

    const result = await importFromZip(zipFile({
      sourceWorks: [
        { id: 'their-sw', name: '  work one ' },
        { id: 'sw2', name: 'Work Two' },
        { id: 'sw3', name: 'Work Three' },
      ],
      characters: [
        { id: 'their-c', name: 'alice', sourceWorkIds: ['their-sw', 'sw2'] },
        { id: 'other-alice', name: 'Alice', sourceWorkIds: ['sw3'] }, // same name, no shared work
      ],
      images: [manifestImage('aaa', { characterIds: ['their-c', 'other-alice'], sourceWorkIds: ['their-sw'] })],
    }))

    expect(result).toMatchObject({ sourceWorksAdded: 2, charactersAdded: 1, imagesAdded: 1 })
    expect((await db.sourceWorks.toArray()).map(s => s.id).sort()).toEqual(['local-sw', 'sw2', 'sw3'])
    expect(await db.characters.get('local-c')).toMatchObject({ sourceWorkIds: ['local-sw', 'sw2'] })
    expect(await db.characters.get('other-alice')).toMatchObject({ sourceWorkIds: ['sw3'] })
    expect(await db.images.get('aaa')).toMatchObject({
      characterIds: ['local-c', 'other-alice'],
      sourceWorkIds: ['local-sw'],
    })
  })
})

describe('importImageFiles in S3 mode', () => {
  const png = (text: string, name = `${text}.png`) => new File([text], name, { type: 'image/png' })

  it('uploads each image to S3 under its content hash and syncs the manifest once at the end', async () => {
    const result = await importImageFiles([png('one'), png('two'), new File(['three'], 'three.webp', { type: 'image/webp' })])

    expect(result).toEqual({ added: 3, skipped: 0, failed: 0 })
    const images = await db.images.toArray()
    expect(images).toHaveLength(3)
    for (const img of images) {
      expect(img.contentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(img.opfsPath).toBe(`images/${img.contentHash}.${img.mimeType === 'image/webp' ? 'webp' : 'png'}`)
      expect(bucket.objects.has(img.opfsPath)).toBe(true)
    }

    await vi.waitFor(() => expect(bucket.inFlight === 0 && bucket.puts.length > 0).toBe(true))
    await sleep(SETTLE_MS)
    expect(bucket.puts).toHaveLength(1)
    expect(bucket.manifest!.images).toHaveLength(3)
  })

  it('skips duplicates by content, including within the same batch', async () => {
    const result = await importImageFiles([png('same', 'a.png'), png('same', 'b.png')])

    expect(result).toEqual({ added: 1, skipped: 1, failed: 0 })
    expect(saveImageToS3).toHaveBeenCalledTimes(1)
  })

  it('counts a failed S3 upload without aborting the batch', async () => {
    vi.mocked(saveImageToS3).mockRejectedValueOnce(new Error('AccessDenied'))

    const result = await importImageFiles([png('one'), png('two')])

    expect(result).toEqual({ added: 1, skipped: 0, failed: 1 })
    await vi.waitFor(() => expect(bucket.manifest?.images).toHaveLength(1))
    expect(consoleError).toHaveBeenCalledWith('Failed to import one.png:', expect.any(Error))
  })
})
