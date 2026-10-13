import { locale, t } from '../i18n'
import type { Lang } from '../i18n'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const formats = new Map<Lang, { weekday: Intl.DateTimeFormat; monthDay: Intl.DateTimeFormat; full: Intl.DateTimeFormat; dateTime: Intl.DateTimeFormat; number: Intl.NumberFormat }>()
/** Formatters for the active language (reads `locale`, so reactive callers follow a language switch). */
function fmt(): NonNullable<ReturnType<typeof formats.get>> {
  const l = locale.lang
  let f = formats.get(l)
  if (!f) {
    f = {
      weekday: new Intl.DateTimeFormat(l, { weekday: 'short' }),
      monthDay: new Intl.DateTimeFormat(l, { month: 'short', day: 'numeric' }),
      full: new Intl.DateTimeFormat(l, { month: 'short', day: 'numeric', year: 'numeric' }),
      dateTime: new Intl.DateTimeFormat(l, { dateStyle: 'medium', timeStyle: 'short' }),
      number: new Intl.NumberFormat(l, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    }
    formats.set(l, f)
  }
  return f
}

const startOfDay = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0)

/** "just now", "5 min ago", "3 hr ago", "Yesterday", "Mon", "Oct 2", "Oct 2, 2024" (in the active language). */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const d = Math.max(0, now - ts)
  if (d < 45_000) return t('time.now')
  if (d < HOUR) return t('time.min', { n: Math.max(1, Math.round(d / MIN)) })
  if (d < DAY) return t('time.hr', { n: Math.round(d / HOUR) })
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY)
  if (days <= 1) return t('time.yesterday')
  const f = fmt()
  if (days < 7) return f.weekday.format(ts)
  return new Date(ts).getFullYear() === new Date(now).getFullYear() ? f.monthDay.format(ts) : f.full.format(ts)
}

/** "Oct 2, 2026, 3:04 PM" in the active language. */
export const formatDateTime = (ts: number): string => fmt().dateTime.format(ts)

/** "12 KB" / "1.4 MB" with the active language's decimal mark. */
export const formatSize = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${fmt().number.format(bytes / 1024 / 1024)} MB`
