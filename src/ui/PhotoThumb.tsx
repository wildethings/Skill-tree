import type { Photo } from '../types'
import { usePhotoUrl } from '../data/photoUrls'

/** Holds the thumbnail's space while its signed URL is being fetched. */
export function PhotoThumb({ photo, alt = '' }: { photo: Photo; alt?: string }) {
  const url = usePhotoUrl(photo.url)
  if (!url) return <span className="thumb-pending" aria-hidden="true" />
  return <img src={url} alt={alt} loading="lazy" width={photo.width} height={photo.height} />
}
