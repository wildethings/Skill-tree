const DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const DAY_SHORT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const MONTH = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

/** Parses YYYY-MM-DD as a local date, so a log entry never slips a day. */
export const parseDay = (iso: string): Date => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export const formatDay = (iso: string): string => DAY.format(parseDay(iso))
export const formatDayShort = (iso: string): string => DAY_SHORT.format(parseDay(iso))
export const formatMonth = (key: string): string => MONTH.format(parseDay(`${key}-01`))
export const monthKey = (iso: string): string => iso.slice(0, 7)
