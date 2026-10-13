import type { SyncProgress, SyncStatus } from '../../../shared/api'
import { locale, t } from '../i18n'
import { relativeTime } from './time'

export type ChipTone = 'off' | 'busy' | 'ok' | 'warn' | 'bad'

export interface SyncChip {
  text: string
  /** The tooltip: the error when there is one. */
  title: string
  tone: ChipTone
}

/** "just now", "2 min ago", ... for the status bar and the settings page. */
export function syncedWhen(ts: number, now: number): string {
  const r = relativeTime(ts, now)
  return r === t('time.yesterday') ? r.toLocaleLowerCase(locale.lang) : r
}

/** "45 s", "1 min", "12 min": how long a round has been running. */
const elapsed = (ms: number): string => (ms < 60_000 ? t('sync.sec', { n: Math.round(ms / 1000) }) : t('sync.min', { n: Math.round(ms / 60_000) }))

/** The phase in words with its counts, plus the elapsed time once the round has run longer than 10 s. */
export function syncProgressText(p: SyncProgress, now: number): string {
  const { done, total } = p
  const text =
    p.phase === 'upload' && total > 0 ? t('sync.phase.upload', { done, total })
    : p.phase === 'apply' && total > 0 ? t('sync.phase.apply', { done, total })
    : p.phase === 'merge' && total > 0 ? t('sync.phase.merge', { n: total })
    : p.phase === 'list' ? (done > 0 ? t('sync.phase.list', { n: done }) : t('sync.phase.listStart'))
    : t('sync.syncing')
  return now - p.startedAt > 10_000 ? `${text} · ${elapsed(now - p.startedAt)}` : text
}

/** What the status bar's sync chip shows for a given status. */
export function syncChip(s: SyncStatus | null, now: number): SyncChip {
  if (!s || !s.configured || s.state === 'off') return { text: t('sync.off'), title: t('sync.open'), tone: 'off' }
  if (s.needsPassphrase) return { text: t('sync.passphrase'), title: t('sync.open'), tone: 'warn' }
  if (s.state === 'error') return { text: t('sync.error'), title: s.lastError ?? t('sync.error'), tone: 'bad' }
  if (s.state === 'syncing') {
    const p = s.progress
    const counted = p && p.total > 0 && (p.phase === 'upload' || p.phase === 'apply')
    return { text: counted ? t('sync.syncingCount', { done: p.done, total: p.total }) : t('sync.syncing'), title: t('sync.open'), tone: 'busy' }
  }
  return {
    text: s.lastSyncAt === null ? t('sync.on') : t('sync.synced', { when: syncedWhen(s.lastSyncAt, now) }),
    title: s.lastError ?? t('sync.open'),
    tone: 'ok'
  }
}
