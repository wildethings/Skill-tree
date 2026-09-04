/** Client-generated ids: the app writes optimistically and syncs later, so ids
 *  cannot come from the server. */
export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const now = (): string => new Date().toISOString()

/** Local calendar date as YYYY-MM-DD, for log entry defaults. */
export const today = (): string => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
