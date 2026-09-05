import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cacheEntryFor, needsRequest, toObjectPath } from '../src/data/photoUrls'

test('a legacy public URL reduces to its object path', () => {
  // Photos uploaded while the bucket was public stored a full URL; they must
  // still resolve once the bucket is private.
  const legacy =
    'https://abc.supabase.co/storage/v1/object/public/photos/user-1/photo-9-thumb.jpg'
  assert.equal(toObjectPath(legacy), 'user-1/photo-9-thumb.jpg')
})

test('a stored path is left alone', () => {
  assert.equal(toObjectPath('user-1/photo-9-thumb.jpg'), 'user-1/photo-9-thumb.jpg')
})

test('a data URL is left alone, so local mode is unaffected', () => {
  assert.equal(toObjectPath('data:image/jpeg;base64,abc'), 'data:image/jpeg;base64,abc')
})

test('a signed URL is cached, and re-signed before it expires', () => {
  const now = 1_000_000
  const entry = cacheEntryFor('https://signed.example/x.jpg', now)
  assert.equal(entry.url, 'https://signed.example/x.jpg')
  assert.equal(needsRequest(entry, now), false)
  assert.ok(entry.expiresAt - now < 3600 * 1000, 're-signs before the hour is up')
  assert.equal(needsRequest(entry, entry.expiresAt + 1), true)
})

test('a failed signing is cached, so a broken photo cannot loop forever', () => {
  // The resolver re-checks the cache on every render. An uncached failure would
  // request again each time, hammering storage and never settling.
  const now = 1_000_000
  const failure = cacheEntryFor(undefined, now)
  assert.equal(failure.url, null)
  assert.equal(needsRequest(failure, now), false, 'suppressed during the backoff')
  assert.equal(needsRequest(failure, now + 16_000), true, 'retried once the backoff elapses')
})

test('an unknown path is requested', () => {
  assert.equal(needsRequest(undefined, Date.now()), true)
})
