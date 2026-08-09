// Business operates in Lehigh Valley, PA — every "today" calculation
// across the app needs to resolve to this timezone, not the runtime's raw
// UTC clock. `new Date().toISOString().split('T')[0]` looks correct but
// silently returns TOMORROW's date for ~4-5 hours every evening (from
// roughly 7-8pm Eastern until midnight UTC), since it reads the UTC
// calendar date, not the local one.
//
// Confirmed live 2026-08-08, 8:24pm Eastern: UTC was already showing
// 2026-08-09 while the actual local date was still 2026-08-08. That one
// bug, repeated at nearly every "today" default across the app (Dashboard,
// Orders, Pick, Routes, Sort, driver home/load-truck, route creation...),
// is what caused a route created that evening to silently land on
// tomorrow's date, Sort to say "no route today" for a tote that WAS on a
// route today, and Orders/Routes/Pick to all disagree with each other and
// with the Dashboard about what day it even was.
//
// Use these helpers anywhere "today" (or a business calendar day) is
// meant — never a raw `new Date().toISOString()` slice.
export const BUSINESS_TIMEZONE = 'America/New_York'

/** Today's date, as YYYY-MM-DD, in the business's local timezone. */
export function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE })
}

/**
 * Converts any ISO timestamp to the YYYY-MM-DD it falls on in the
 * business's local timezone. Use this instead of `iso.split('T')[0]`
 * (which reads the UTC calendar date) when grouping/filtering a
 * timestamptz value by calendar day — e.g. "what date was this order
 * placed/delivered on," matching how a human would answer that question.
 */
export function localDateStrFromISO(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE })
}

/**
 * The business timezone's UTC offset (in minutes, local-minus-UTC — e.g.
 * -240 for EDT) at a given instant. Computed via Intl.DateTimeFormat so
 * DST transitions are handled automatically, without pulling in a date
 * library.
 */
function offsetMinutesAt(instant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(instant)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const localWallAsUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return (localWallAsUTC - instant.getTime()) / 60000
}

/**
 * UTC start/end instants (ISO strings) corresponding to local
 * midnight-to-midnight for a given YYYY-MM-DD business-local date. Use
 * this instead of `${date}T00:00:00.000Z` when filtering a timestamptz
 * column (e.g. generated_at, completed_at) by a calendar day — the naive
 * version treats the date string as a UTC day, which is 4-5 hours off
 * from the actual local business day.
 */
export function localDayBoundsUTC(dateStr: string): { startUTC: string; endUTC: string } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const roughUTCMidnight = new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
  const offsetMin = offsetMinutesAt(roughUTCMidnight)
  const startUTC = new Date(roughUTCMidnight.getTime() - offsetMin * 60000)
  const endUTC = new Date(startUTC.getTime() + 86400000)
  return { startUTC: startUTC.toISOString(), endUTC: endUTC.toISOString() }
}
