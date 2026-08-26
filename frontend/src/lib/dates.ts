const pad = (n: number) => String(n).padStart(2, "0")

/** local yyyy-mm-dd (toISOString would shift across midnight in non-UTC zones) */
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

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

export const weekdayShort = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short" })

export const dayLong = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })

export const rangeLabel = (start: Date) => {
  const end = addDays(start, 6)
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
  return `${start.toLocaleDateString("en-GB", opts)} – ${end.toLocaleDateString("en-GB", opts)}`
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
  d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })

export const WEEKDAY_HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
