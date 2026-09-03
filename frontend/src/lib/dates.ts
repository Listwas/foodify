import { locale } from "./i18n"

const pad = (n: number) => String(n).padStart(2, "0")

/** local yyyy-mm-dd (toISOString would shift across midnight in non-UTC zones) */
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const today = () => iso(new Date())

/**
 * Whole days from `from` to `to`, both yyyy-mm-dd. Negative when `to` is
 * earlier. Compared as UTC midnights so a daylight-saving change in between
 * can't turn a day into 23 or 25 hours and round the answer off by one.
 */
export function daysBetween(from: string, to: string): number {
  const utc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

export function startOfWeek(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7)) // back to monday
  return copy
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

export const weekdayShort = (d: Date) => d.toLocaleDateString(locale(), { weekday: "short" })

export const dayLong = (d: Date) =>
  d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "short" })

export const rangeLabel = (start: Date) => {
  const end = addDays(start, 6)
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
  return `${start.toLocaleDateString(locale(), opts)} – ${end.toLocaleDateString(locale(), opts)}`
}

export function addMonths(d: Date, n: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth() + n, 1)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

/** The 6x7 grid covering a month, padded with the adjacent months' days. */
export function monthGrid(monthStart: Date): Date[] {
  const first = startOfWeek(monthStart)
  return [...Array(42)].map((_, i) => addDays(first, i))
}

export const monthLabel = (d: Date) =>
  d.toLocaleDateString(locale(), { month: "long", year: "numeric" })

/** Column headings for the month grid, in whichever language is on. */
export const weekdayHeads = () => {
  const monday = startOfWeek(new Date())
  return [...Array(7)].map((_, i) => weekdayShort(addDays(monday, i)))
}
