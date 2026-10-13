import { describe, expect, it } from 'vitest'
import type { SyncProgress, SyncStatus } from '../../src/shared/api'
import { locale } from '../../src/renderer/src/i18n'
import { syncChip, syncedWhen, syncProgressText } from '../../src/renderer/src/lib/syncChip'

const NOW = new Date(2026, 9, 13, 15, 0, 0).getTime()
const MIN = 60_000

const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({
  configured: true,
  transport: 'gdrive',
  target: 'me@example.test',
  encrypted: false,
  needsPassphrase: false,
  state: 'idle',
  lastSyncAt: NOW - 2 * MIN,
  lastError: null,
  conflicts: 0,
  deviceName: 'laptop',
  progress: null,
  ...over
})

describe('sync chip', () => {
  it('says "Sync off" before sync is set up', () => {
    expect(syncChip(null, NOW).text).toBe('Sync off')
    expect(syncChip(status({ configured: false, state: 'off' }), NOW)).toMatchObject({ text: 'Sync off', tone: 'off' })
  })
  it('shows relative time since the last sync', () => {
    expect(syncChip(status(), NOW)).toMatchObject({ text: 'Synced 2 min ago', tone: 'ok' })
    expect(syncChip(status({ lastSyncAt: NOW - 10_000 }), NOW).text).toBe('Synced just now')
    expect(syncChip(status({ lastSyncAt: NOW - 3 * 60 * MIN }), NOW).text).toBe('Synced 3 hr ago')
    expect(syncChip(status({ lastSyncAt: NOW - 30 * 60 * MIN }), NOW).text).toBe('Synced yesterday')
  })
  it('refreshes as the clock moves', () => {
    const s = status()
    expect(syncChip(s, NOW).text).toBe('Synced 2 min ago')
    expect(syncChip(s, NOW + 8 * MIN).text).toBe('Synced 10 min ago')
  })
  it('shows progress, the passphrase prompt, and errors with the message in the title', () => {
    expect(syncChip(status({ state: 'syncing' }), NOW)).toMatchObject({ text: 'Syncing…', tone: 'busy' })
    expect(syncChip(status({ needsPassphrase: true }), NOW)).toMatchObject({ text: 'Sync paused: enter passphrase', tone: 'warn' })
    expect(syncChip(status({ state: 'error', lastError: 'Google Drive is full.' }), NOW)).toEqual({
      text: 'Sync error',
      title: 'Google Drive is full.',
      tone: 'bad'
    })
  })
  it('does not claim "Synced" when nothing has synced yet', () => {
    expect(syncChip(status({ lastSyncAt: null }), NOW).text).toBe('Sync on')
  })
  it('formats the time without a leading capital for yesterday', () => {
    expect(syncedWhen(NOW - 5 * MIN, NOW)).toBe('5 min ago')
  })
})

const progress = (phase: SyncProgress['phase'], done: number, total: number, over: Partial<SyncProgress> = {}): SyncProgress => ({ phase, done, total, startedAt: NOW - 3000, ...over })
const syncing = (p: SyncProgress | null): SyncStatus => status({ state: 'syncing', progress: p })

describe('sync progress', () => {
  it('shows counts in the chip while uploading or applying, plain "Syncing…" otherwise', () => {
    expect(syncChip(syncing(progress('upload', 12, 162)), NOW)).toMatchObject({ text: 'Syncing 12/162', tone: 'busy' })
    expect(syncChip(syncing(progress('apply', 3, 40)), NOW).text).toBe('Syncing 3/40')
    expect(syncChip(syncing(progress('list', 400, 0)), NOW).text).toBe('Syncing…')
    expect(syncChip(syncing(progress('merge', 1, 3)), NOW).text).toBe('Syncing…')
    expect(syncChip(syncing(progress('upload', 0, 0)), NOW).text).toBe('Syncing…') // total unknown
    expect(syncChip(syncing(null), NOW).text).toBe('Syncing…')
  })
  it('describes the phase in words', () => {
    expect(syncProgressText(progress('upload', 12, 162), NOW)).toBe('Uploading changes: 12 of 162')
    expect(syncProgressText(progress('list', 0, 0), NOW)).toBe('Reading the sync location…')
    expect(syncProgressText(progress('list', 400, 0), NOW)).toBe('Reading the sync location: 400 files')
    expect(syncProgressText(progress('list', 1, 0), NOW)).toBe('Reading the sync location: 1 file')
    expect(syncProgressText(progress('merge', 0, 3), NOW)).toBe('Merging 3 notes')
    expect(syncProgressText(progress('merge', 1, 1), NOW)).toBe('Merging 1 note')
    expect(syncProgressText(progress('apply', 3, 40), NOW)).toBe('Downloading changes: 3 of 40')
    expect(syncProgressText(progress('upload', 0, 0), NOW)).toBe('Syncing…')
  })
  it('adds the elapsed time once the round has run for over 10 s', () => {
    expect(syncProgressText(progress('upload', 12, 162, { startedAt: NOW - 10_000 }), NOW)).toBe('Uploading changes: 12 of 162')
    expect(syncProgressText(progress('upload', 12, 162, { startedAt: NOW - 12_000 }), NOW)).toBe('Uploading changes: 12 of 162 · 12 s')
    expect(syncProgressText(progress('upload', 12, 162, { startedAt: NOW - 61_000 }), NOW)).toBe('Uploading changes: 12 of 162 · 1 min')
    expect(syncProgressText(progress('list', 5, 0, { startedAt: NOW - 5 * MIN }), NOW)).toBe('Reading the sync location: 5 files · 5 min')
  })
  it('follows the language', () => {
    locale.lang = 'es'
    try {
      expect(syncProgressText(progress('upload', 12, 162), NOW)).toBe('Subiendo cambios: 12 de 162')
      expect(syncProgressText(progress('merge', 0, 1), NOW)).toBe('Combinando 1 nota')
    } finally {
      locale.lang = 'en'
    }
  })
})
