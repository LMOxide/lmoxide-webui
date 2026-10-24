const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

/** A unix time (seconds) as a local date and time. */
export function formatTime(unix: number | null | undefined): string {
  return unix == null ? "—" : dateTime.format(unix * 1000)
}

/** A unix time (seconds) relative to now: "3 hours ago", "in 2 days". */
export function formatRelative(unix: number | null | undefined): string {
  if (unix == null) return "—"
  const diff = unix - Date.now() / 1000
  const abs = Math.abs(diff)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ]
  for (const [unit, secs] of units) {
    if (abs >= secs) return relative.format(Math.round(diff / secs), unit)
  }
  return relative.format(Math.round(diff), "second")
}

/** How long since a unix time, compactly: "2d 3h", "45m". */
export function formatSince(unix: number | null | undefined): string {
  if (unix == null) return "—"
  let s = Math.max(0, Math.floor(Date.now() / 1000 - unix))
  const d = Math.floor(s / 86_400)
  s -= d * 86_400
  const h = Math.floor(s / 3_600)
  s -= h * 3_600
  const m = Math.floor(s / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

export const numberFormat = new Intl.NumberFormat()
