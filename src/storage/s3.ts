import { getS3Config, type S3Config } from './settings'

const MANIFEST_KEY = 'manifest.json'

function requireConfig(): S3Config {
  const config = getS3Config()
  if (!config) throw new Error('S3 storage mode is active but not configured')
  return config
}

async function buildClient(config: S3Config) {
  const { S3Client } = await import('@aws-sdk/client-s3')
  return new S3Client({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
}

export async function saveImageToS3(
  buffer: ArrayBuffer,
  contentHash: string,
  ext: string,
  mimeType: string,
): Promise<string> {
  const config = requireConfig()
  const [client, { PutObjectCommand }] = await Promise.all([buildClient(config), import('@aws-sdk/client-s3')])
  const key = `images/${contentHash}.${ext}`
  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: new Uint8Array(buffer),
    ContentType: mimeType,
  }))
  return key
}

export async function getImageFileFromS3(key: string): Promise<File> {
  const config = requireConfig()
  const [client, { GetObjectCommand }] = await Promise.all([buildClient(config), import('@aws-sdk/client-s3')])
  const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
  const bytes = await res.Body!.transformToByteArray()
  const filename = key.split('/').pop() ?? key
  return new File([bytes], filename, { type: res.ContentType ?? 'application/octet-stream' })
}

export async function deleteImageFromS3(key: string): Promise<void> {
  const config = requireConfig()
  const [client, { DeleteObjectCommand }] = await Promise.all([buildClient(config), import('@aws-sdk/client-s3')])
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
}

export type S3ConnectionResult = { ok: true } | { ok: false; message: string }

export async function testS3Connection(config: S3Config): Promise<S3ConnectionResult> {
  try {
    const [client, { HeadBucketCommand }] = await Promise.all([buildClient(config), import('@aws-sdk/client-s3')])
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }))
    return { ok: true }
  } catch (err: any) {
    return { ok: false, message: err?.message ?? 'Connection failed' }
  }
}

export async function putManifestToS3(manifest: unknown): Promise<void> {
  const config = requireConfig()
  const [client, { PutObjectCommand }] = await Promise.all([buildClient(config), import('@aws-sdk/client-s3')])
  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: MANIFEST_KEY,
    Body: new TextEncoder().encode(JSON.stringify(manifest)),
    ContentType: 'application/json',
  }))
}

export async function getManifestFromS3<T>(): Promise<T | null> {
  const config = requireConfig()
  try {
    const [client, { GetObjectCommand }] = await Promise.all([buildClient(config), import('@aws-sdk/client-s3')])
    const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: MANIFEST_KEY }))
    return JSON.parse(await res.Body!.transformToString())
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null
    throw err
  }
}
