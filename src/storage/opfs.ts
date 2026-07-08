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

export async function getImageUrl(opfsPath: string): Promise<string> {
  const dir = await getImagesDir()
  const fileHandle = await dir.getFileHandle(opfsPath)
  const file = await fileHandle.getFile()
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

    img.onload = () => {
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
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image for thumbnail'))
    }

    img.src = objectUrl
  })
}
