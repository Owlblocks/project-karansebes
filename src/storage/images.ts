import { getStorageMode } from './settings'
import { saveImageToOPFS, getImageFile as getOPFSFile, deleteImageFromOPFS } from './opfs'
import { saveImageToS3, getImageFileFromS3, deleteImageFromS3 } from './s3'

export interface SaveImageParams {
  buffer: ArrayBuffer
  ext: string
  mimeType: string
  contentHash: string
}

/** Saves image bytes to whichever backend is currently active. Returns the storage key (stored as `opfsPath`). */
export async function saveImage(params: SaveImageParams): Promise<string> {
  return getStorageMode() === 's3'
    ? saveImageToS3(params.buffer, params.contentHash, params.ext, params.mimeType)
    : saveImageToOPFS(params.buffer, params.ext)
}

export async function getImageFile(key: string): Promise<File> {
  return getStorageMode() === 's3' ? getImageFileFromS3(key) : getOPFSFile(key)
}

export async function getImageUrl(key: string): Promise<string> {
  const file = await getImageFile(key)
  return URL.createObjectURL(file)
}

export async function deleteImage(key: string): Promise<void> {
  return getStorageMode() === 's3' ? deleteImageFromS3(key) : deleteImageFromOPFS(key)
}
