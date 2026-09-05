import { useEffect, useState } from 'react'
import { backend } from './backend'

/**
 * Resolves a stored photo reference to something an <img> can load.
 *
 * The bucket is private, so what is stored is an object path and reads need a
 * signed URL that expires. Requests made in the same tick are batched into one
 * call — a log entry renders several thumbnails at once — and results are
 * cached until shortly before they expire.
 */

const TTL_SECONDS = 3600
/** Re-sign a little early rather than handing out a URL about to expire. */
const REFRESH_AT = 0.8

/** `url: null` records a failure so it is not retried on every render. */
export type PhotoEntry = { url: string | null; expiresAt: number }
const FAILURE_BACKOFF_MS = 15_000

/**
 * A signed URL is cached until shortly before it expires; a failure is cached
 * too, for a short backoff. Caching the failure is what matters: the resolver
 * re-checks on every render, so an uncached failure would re-request forever.
 */
export function cacheEntryFor(url: string | undefined, now: number): PhotoEntry {
  return url
    ? { url, expiresAt: now + TTL_SECONDS * REFRESH_AT * 1000 }
    : { url: null, expiresAt: now + FAILURE_BACKOFF_MS }
}

/** Whether a path should be asked for again. */
export function needsRequest(entry: PhotoEntry | undefined, now: number): boolean {
  return !entry || entry.expiresAt < now
}
const cache = new Map<string, PhotoEntry>()
const listeners = new Set<() => void>()

let pending = new Set<string>()
let flushing: Promise<void> | null = null

/** A data: or http(s): reference is already loadable and needs no signing. */
const isDirect = (ref: string) => ref.startsWith('data:') || ref.startsWith('blob:')

/**
 * Photos uploaded before the bucket was made private stored a full public URL.
 * Reduce those to the object path so they can be signed like everything else.
 */
export function toObjectPath(ref: string): string {
  const marker = '/storage/v1/object/public/photos/'
  const at = ref.indexOf(marker)
  return at === -1 ? ref : ref.slice(at + marker.length)
}

function flush(): Promise<void> {
  flushing ??= Promise.resolve().then(async () => {
    const paths = [...pending]
    pending = new Set()
    flushing = null
    if (paths.length === 0) return
    try {
      const signed = await backend.signPhotoUrls(paths, TTL_SECONDS)
      // A path missing from the response is a failure too, and is recorded as
      // one — otherwise every render asks for it again.
      for (const path of paths) cache.set(path, cacheEntryFor(signed[path], Date.now()))
    } catch {
      for (const path of paths) cache.set(path, cacheEntryFor(undefined, Date.now()))
    }
    for (const notify of listeners) notify()
  })
  return flushing
}

function request(path: string) {
  pending.add(path)
  void flush()
}

/** Returns null until a URL is available, so callers can hold space for it. */
export function usePhotoUrl(ref: string | null | undefined): string | null {
  const [, bump] = useState(0)

  useEffect(() => {
    const notify = () => bump((n) => n + 1)
    listeners.add(notify)
    return () => {
      listeners.delete(notify)
    }
  }, [])

  useEffect(() => {
    if (!ref || isDirect(ref)) return
    const path = toObjectPath(ref)
    // A cached failure is still a cache hit until its backoff elapses, which is
    // what stops a failing sign from being retried on every single render.
    if (needsRequest(cache.get(path), Date.now())) request(path)
  })

  if (!ref) return null
  if (isDirect(ref)) return ref
  const hit = cache.get(toObjectPath(ref))
  return hit && hit.expiresAt > Date.now() ? hit.url : null
}

/** Test seam. */
export const __clearPhotoUrlCache = () => {
  cache.clear()
  pending = new Set()
}
