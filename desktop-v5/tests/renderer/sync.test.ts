import { describe, expect, it } from 'vitest'
import type { SyncStatus } from '../../src/shared/api'
import { syncChip, syncedWhen } from '../../src/renderer/src/lib/syncChip'

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
