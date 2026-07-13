import { Zip, ZipPassThrough, strToU8, strFromU8, unzipSync } from 'fflate'
import { db, type ImageRecord, type Character, type SourceWork } from '../db/database'
import { getImageFile, saveImageToOPFS } from './opfs'

interface Manifest {
  version: 1
  exportedAt: string
  images: ImageRecord[]
  characters: Character[]
  sourceWorks: SourceWork[]
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportAll(onProgress?: (msg: string) => void): Promise<void> {
  onProgress?.('Reading database…')
  const [images, characters, sourceWorks] = await Promise.all([
    db.images.toArray(),
    db.characters.toArray(),
    db.sourceWorks.toArray(),
  ])

  const manifest: Manifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    images,
    characters,
    sourceWorks,
  }

  const filename = `karansebes-${new Date().toISOString().slice(0, 10)}.zip`

  if ('showSaveFilePicker' in window) {
    let handle: FileSystemFileHandle
    try {
      handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
      })
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      throw e
    }
    const writable = await handle.createWritable()
    await streamZip(manifest, images, onProgress, async (chunk) => { await writable.write(chunk as Uint8Array<ArrayBuffer>) })
    await writable.close()
  } else {
    const chunks: Uint8Array<ArrayBuffer>[] = []
    await streamZip(manifest, images, onProgress, (chunk) => { chunks.push(chunk as Uint8Array<ArrayBuffer>) })
    const blob = new Blob(chunks, { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

async function streamZip(
  manifest: Manifest,
  images: ImageRecord[],
  onProgress: ((msg: string) => void) | undefined,
  onChunk: (chunk: Uint8Array<ArrayBuffer>) => void | Promise<void>,
): Promise<void> {
  // Chain writes so async onChunk calls stay in order without blocking fflate's sync callbacks
  let writeQueue = Promise.resolve()

  const zip = new Zip((err, chunk, final) => {
    if (err) throw err
    const safe = chunk as Uint8Array<ArrayBuffer>
    writeQueue = writeQueue.then(() => onChunk(safe))
    if (final) writeQueue = writeQueue.then(() => undefined)
  })

  const addEntry = (name: string, data: Uint8Array) => {
    const entry = new ZipPassThrough(name)
    zip.add(entry)
    entry.push(data, true)
  }

  addEntry('manifest.json', strToU8(JSON.stringify(manifest)))

  for (let i = 0; i < images.length; i++) {
    onProgress?.(`Reading image ${i + 1} / ${images.length}…`)
    const img = images[i]
    try {
      const file = await getImageFile(img.opfsPath)
      const buf = new Uint8Array(await file.arrayBuffer())
      addEntry(`images/${img.contentHash}`, buf)
      await writeQueue // let pending writes drain before reading the next image
    } catch {
      // OPFS file missing — manifest entry still exports, image data skipped
    }
  }

  zip.end()
  await writeQueue
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportResult {
  imagesAdded: number
  imagesSkipped: number
  charactersAdded: number
  sourceWorksAdded: number
}

export async function importFromZip(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<ImportResult> {
  onProgress?.('Reading archive…')
  const buf = await file.arrayBuffer()
  const entries = unzipSync(new Uint8Array(buf))

  const manifestBytes = entries['manifest.json']
  if (!manifestBytes) throw new Error('Not a valid export — manifest.json missing')
  const manifest: Manifest = JSON.parse(strFromU8(manifestBytes))
  if (manifest.version !== 1) throw new Error(`Unknown manifest version: ${manifest.version}`)

  // --- Phase 1: merge SourceWorks ---
  onProgress?.('Merging source works…')
  const localSourceWorks = await db.sourceWorks.toArray()
  const swIdMap = new Map<string, string>() // importedId → localId
  let sourceWorksAdded = 0

  for (const incoming of manifest.sourceWorks) {
    const key = incoming.name.trim().toLowerCase()
    const match = localSourceWorks.find(sw => sw.name.trim().toLowerCase() === key)
    if (match) {
      swIdMap.set(incoming.id!, match.id!)
    } else {
      await db.sourceWorks.put(incoming)
      localSourceWorks.push(incoming)
      swIdMap.set(incoming.id!, incoming.id!)
      sourceWorksAdded++
    }
  }

  // --- Phase 2: merge Characters ---
  onProgress?.('Merging characters…')
  const localCharacters = await db.characters.toArray()
  const charIdMap = new Map<string, string>() // importedId → localId
  let charactersAdded = 0

  for (const incoming of manifest.characters) {
    const remappedSourceWorkIds = incoming.sourceWorkIds.map(id => swIdMap.get(id) ?? id)
    const nameKey = incoming.name.trim().toLowerCase()
    const sameNameCandidates = localCharacters.filter(c => c.name.trim().toLowerCase() === nameKey)

    let matched: Character | undefined

    if (sameNameCandidates.length === 0) {
      // No local character with this name
    } else if (remappedSourceWorkIds.length === 0 || sameNameCandidates.some(c => c.sourceWorkIds.length === 0)) {
      // Either side has no source works — match by name alone (Pepe/Wojak-type characters)
      matched = sameNameCandidates[0]
    } else {
      // Both sides have source works — require overlap
      matched = sameNameCandidates.find(c =>
        c.sourceWorkIds.some(id => remappedSourceWorkIds.includes(id)),
      )
    }

    if (matched) {
      charIdMap.set(incoming.id!, matched.id!)
      // Union source work IDs if incoming added new ones
      const merged = [...new Set([...matched.sourceWorkIds, ...remappedSourceWorkIds])]
      if (merged.length !== matched.sourceWorkIds.length) {
        await db.characters.update(matched.id!, { sourceWorkIds: merged })
        matched.sourceWorkIds = merged
      }
    } else {
      const toInsert: Character = { ...incoming, sourceWorkIds: remappedSourceWorkIds }
      await db.characters.put(toInsert)
      localCharacters.push(toInsert)
      charIdMap.set(incoming.id!, incoming.id!)
      charactersAdded++
    }
  }

  // --- Phase 3: import images ---
  let imagesAdded = 0
  let imagesSkipped = 0

  for (let i = 0; i < manifest.images.length; i++) {
    const img = manifest.images[i]
    onProgress?.(`Importing image ${i + 1} / ${manifest.images.length}…`)

    const existing = await db.images.get(img.contentHash)
    if (existing) { imagesSkipped++; continue }

    const imgBytes = entries[`images/${img.contentHash}`]
    if (!imgBytes) { imagesSkipped++; continue }

    const ext = img.opfsPath.split('.').pop() ?? 'bin'
    const opfsPath = await saveImageToOPFS(imgBytes.buffer as ArrayBuffer, ext)

    await db.images.add({
      ...img,
      opfsPath,
      characterIds: img.characterIds.map(id => charIdMap.get(id) ?? id),
      sourceWorkIds: img.sourceWorkIds.map(id => swIdMap.get(id) ?? id),
    })
    imagesAdded++
  }

  return { imagesAdded, imagesSkipped, charactersAdded, sourceWorksAdded }
}
