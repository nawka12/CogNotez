import { t } from '../i18n'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const weekday = new Intl.DateTimeFormat('en', { weekday: 'short' })
const monthDay = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
const full = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })

const startOfDay = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0)

/** "just now", "5 min ago", "3 hr ago", "Yesterday", "Mon", "Oct 2", "Oct 2, 2024". */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const d = Math.max(0, now - ts)
  if (d < 45_000) return t('time.now')
  if (d < HOUR) return t('time.min', { n: Math.max(1, Math.round(d / MIN)) })
  if (d < DAY) return t('time.hr', { n: Math.round(d / HOUR) })
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY)
  if (days <= 1) return t('time.yesterday')
  if (days < 7) return weekday.format(ts)
  return new Date(ts).getFullYear() === new Date(now).getFullYear() ? monthDay.format(ts) : full.format(ts)
}
