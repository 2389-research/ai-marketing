// Timezone that posting times are expressed in. Must stay in sync with the
// server-side SCHEDULE_TIMEZONE (agents/scheduler.py) so the "9am" the
// scheduler picks as an optimal slot is the "9am" shown in the UI — otherwise
// times render in each viewer's browser timezone and a 9am slot can look like
// 2am. Single global setting for now (per-project timezones are a future item).
export const SCHEDULE_TZ = process.env.NEXT_PUBLIC_SCHEDULE_TIMEZONE || 'America/Chicago'

// Formats a stored (UTC) timestamp in the scheduling timezone, e.g.
// "Tue, 9 Jul, 09:00 CDT" — the trailing zone abbreviation makes it
// unambiguous which timezone the time refers to.
export function fmtScheduleTime(iso: string | null, opts?: { withZone?: boolean }): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: SCHEDULE_TZ,
    ...(opts?.withZone ? { timeZoneName: 'short' } : {}),
  })
}
