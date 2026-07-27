async function getImagesDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle('images', { create: true })
}

export async function saveImageToOPFS(buffer: ArrayBuffer, ext: string): Promise<string> {
  const dir = await getImagesDir()
  const filename = `${crypto.randomUUID()}.${ext}`
  const fileHandle = await dir.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(buffer)
  await writable.close()
  return filename
}

export async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function getImageFile(opfsPath: string): Promise<File> {
  const dir = await getImagesDir()
  const fileHandle = await dir.getFileHandle(opfsPath)
  return fileHandle.getFile()
}

export async function getImageUrl(opfsPath: string): Promise<string> {
  const file = await getImageFile(opfsPath)
  return URL.createObjectURL(file)
}

export async function deleteImageFromOPFS(opfsPath: string): Promise<void> {
  const dir = await getImagesDir()
  await dir.removeEntry(opfsPath)
}

export async function generateThumbnail(buffer: ArrayBuffer, mimeType: string, maxSize = 300): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer], { type: mimeType })
    const objectUrl = URL.createObjectURL(blob)
    const img = new Image()

    // Some browsers fire neither onload nor onerror under memory pressure —
    // without a timeout a stuck decode hangs the whole import batch forever.
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Timed out loading image for thumbnail'))
    }, 15_000)

    img.onload = () => {
      clearTimeout(timeout)
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(objectUrl)
      resolve(canvas.toDataURL('image/webp', 0.75))
    }

    img.onerror = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image for thumbnail'))
    }

    img.src = objectUrl
  })
}
