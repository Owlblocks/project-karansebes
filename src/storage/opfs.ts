async function getImagesDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle('images', { create: true })
}

export async function saveImageToOPFS(file: File): Promise<string> {
  const dir = await getImagesDir()
  const uniqueName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const fileHandle = await dir.getFileHandle(uniqueName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(file)
  await writable.close()
  return uniqueName
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

export async function generateThumbnail(file: File, maxSize = 300): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

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
