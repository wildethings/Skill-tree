import type { PhotoUpload } from './adapter'

const THUMB = 400
const FULL = 1400
const QUALITY = 0.82

/**
 * Downscale before transmitting, not after. Full-resolution originals are never
 * stored — uncompressed photos would eat a free-tier storage quota within a few
 * dozen entries.
 */
export async function prepareUpload(file: File, wantFull: boolean): Promise<PhotoUpload> {
  const bitmap = await createImageBitmap(file)
  try {
    const thumb = await encode(bitmap, THUMB)
    const full = wantFull && Math.max(bitmap.width, bitmap.height) > THUMB ? await encode(bitmap, FULL) : null
    return { thumb: thumb.blob, full: full?.blob ?? null, width: thumb.width, height: thumb.height }
  } finally {
    bitmap.close()
  }
}

async function encode(bitmap: ImageBitmap, longEdge: number) {
  const ratio = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * ratio))
  const height = Math.max(1, Math.round(bitmap.height * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that image.'))), 'image/jpeg', QUALITY),
  )
  return { blob, width, height }
}
