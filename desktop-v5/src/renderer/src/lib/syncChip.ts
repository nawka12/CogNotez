import type { SyncStatus } from '../../../shared/api'
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

/** What the status bar's sync chip shows for a given status. */
export function syncChip(s: SyncStatus | null, now: number): SyncChip {
  if (!s || !s.configured || s.state === 'off') return { text: t('sync.off'), title: t('sync.open'), tone: 'off' }
  if (s.needsPassphrase) return { text: t('sync.passphrase'), title: t('sync.open'), tone: 'warn' }
  if (s.state === 'error') return { text: t('sync.error'), title: s.lastError ?? t('sync.error'), tone: 'bad' }
  if (s.state === 'syncing') return { text: t('sync.syncing'), title: t('sync.open'), tone: 'busy' }
  return {
    text: s.lastSyncAt === null ? t('sync.on') : t('sync.synced', { when: syncedWhen(s.lastSyncAt, now) }),
    title: s.lastError ?? t('sync.open'),
    tone: 'ok'
  }
}
