import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '../src/shared/api'
import type { UpdaterLike } from '../src/main/updater'
import { AUTO_KEY, codesignOutputSigned, createUpdater, updateSupported } from '../src/main/updater'

class FakeUpdater extends EventEmitter {
  autoDownload = true
  check = vi.fn(async () => ({}) as unknown)
  download = vi.fn(async () => [] as unknown)
  install = vi.fn()
  checkForUpdates() {
    return this.check()
  }
  downloadUpdate() {
    return this.download()
  }
  quitAndInstall(a?: boolean, b?: boolean) {
    this.install(a, b)
  }
}

function setup(over: { supported?: boolean; auto?: unknown } = {}) {
  const fake = new FakeUpdater()
  const seen: UpdateStatus[] = []
  const settings = new Map<string, unknown>(over.auto === undefined ? [] : [[AUTO_KEY, over.auto]])
  const u = createUpdater({
    updater: async () => fake as unknown as UpdaterLike,
    supported: async () => over.supported ?? true,
    settings: { get: (k) => settings.get(k) },
    onStatus: (s) => seen.push(s),
    startDelayMs: 60_000
  })
  return { fake, seen, u, settings }
}

describe('updateSupported', () => {
  const base = { packaged: true, appImage: undefined, macSigned: async () => false }
  it('is off for unpacked runs', async () => {
    expect(await updateSupported({ ...base, packaged: false, platform: 'win32' })).toBe(false)
  })
  it('needs an AppImage on Linux', async () => {
    expect(await updateSupported({ ...base, platform: 'linux' })).toBe(false)
    expect(await updateSupported({ ...base, platform: 'linux', appImage: '/x/CogNotez.AppImage' })).toBe(true)
  })
  it('needs a signed app on macOS', async () => {
    expect(await updateSupported({ ...base, platform: 'darwin' })).toBe(false)
    expect(await updateSupported({ ...base, platform: 'darwin', macSigned: async () => true })).toBe(true)
  })
  it('is on for a packaged Windows build', async () => {
    expect(await updateSupported({ ...base, platform: 'win32' })).toBe(true)
  })
  it('the dev feed override wins', async () => {
    expect(await updateSupported({ ...base, packaged: false, platform: 'linux', feedOverride: true })).toBe(true)
  })
})

describe('codesignOutputSigned', () => {
  it('accepts a Developer ID signature', () => {
    expect(codesignOutputSigned('Executable=/A.app/Contents/MacOS/CogNotez\nSignature size=9000\nAuthority=Developer ID Application: X (ABCDE12345)\nAuthority=Apple Root CA\nTeamIdentifier=ABCDE12345')).toBe(true)
  })
  it('rejects ad-hoc and unsigned', () => {
    expect(codesignOutputSigned('Signature=adhoc\nTeamIdentifier=not set')).toBe(false)
    expect(codesignOutputSigned('')).toBe(false)
  })
})

describe('update state machine', () => {
  it('stays unsupported and never touches the updater', async () => {
    const { u, fake } = setup({ supported: false })
    expect((await u.status()).state).toBe('unsupported')
    expect((await u.check()).state).toBe('unsupported')
    await u.download()
    await u.install()
    expect(fake.check).not.toHaveBeenCalled()
    expect(fake.download).not.toHaveBeenCalled()
    expect(fake.install).not.toHaveBeenCalled()
    expect(fake.listenerCount('update-available')).toBe(0)
  })

  it('keeps autoDownload off', async () => {
    const { u, fake } = setup()
    await u.status()
    expect(fake.autoDownload).toBe(false)
  })

  it('check -> available -> download -> ready -> install', async () => {
    const { u, fake, seen } = setup()
    fake.check.mockImplementationOnce(async () => {
      fake.emit('update-available', { version: '5.0.0' })
      return {}
    })
    expect(await u.check()).toEqual({ state: 'available', version: '5.0.0', percent: null, error: null })
    fake.download.mockImplementationOnce(async () => {
      fake.emit('download-progress', { percent: 12.7 })
      fake.emit('download-progress', { percent: 12.9 }) // same whole percent: no new status
      fake.emit('download-progress', { percent: 100 })
      fake.emit('update-downloaded', { version: '5.0.0' })
      return []
    })
    await u.download()
    expect(seen.map((s) => [s.state, s.percent])).toEqual([['checking', null], ['available', null], ['downloading', 0], ['downloading', 12], ['downloading', 100], ['ready', null]])
    expect((await u.status()).version).toBe('5.0.0')
    await u.install()
    expect(fake.install).toHaveBeenCalledWith(false, true)
  })

  it('reports none when up to date, and a null check as unsupported', async () => {
    const a = setup()
    a.fake.check.mockImplementationOnce(async () => {
      a.fake.emit('update-not-available', { version: '5.0.0-alpha.1' })
      return {}
    })
    expect((await a.u.check()).state).toBe('none')
    const b = setup()
    b.fake.check.mockResolvedValueOnce(null)
    expect((await b.u.check()).state).toBe('unsupported')
  })

  it('does not download or install out of turn', async () => {
    const { u, fake } = setup()
    await u.download()
    await u.install()
    expect(fake.download).not.toHaveBeenCalled()
    expect(fake.install).not.toHaveBeenCalled()
  })

  it('shows one short error when a check fails (event and rejection together)', async () => {
    const { u, fake, seen } = setup()
    fake.check.mockImplementationOnce(async () => {
      const e = new Error('net::ERR_INTERNET_DISCONNECTED\n<html>very long body</html>')
      fake.emit('error', e)
      throw e
    })
    const s = await u.check()
    expect(s).toEqual({ state: 'error', version: null, percent: null, error: 'net::ERR_INTERNET_DISCONNECTED' })
    expect(seen.filter((x) => x.state === 'error')).toHaveLength(1)
    // a retry is allowed
    fake.check.mockImplementationOnce(async () => {
      fake.emit('update-not-available', {})
      return {}
    })
    expect((await u.check()).state).toBe('none')
  })

  it('a failed download is an error that keeps the version, and a re-check recovers', async () => {
    const { u, fake } = setup()
    fake.check.mockImplementationOnce(async () => (fake.emit('update-available', { version: '5.1.0' }), {}))
    await u.check()
    fake.download.mockRejectedValueOnce(new Error('sha512 checksum mismatch'))
    await u.download()
    expect(await u.status()).toMatchObject({ state: 'error', version: '5.1.0', error: 'sha512 checksum mismatch' })
    fake.check.mockImplementationOnce(async () => (fake.emit('update-available', { version: '5.1.0' }), {}))
    expect((await u.check()).state).toBe('available')
  })

  it('does not re-check while an update is downloading or ready', async () => {
    const { u, fake } = setup()
    fake.check.mockImplementationOnce(async () => (fake.emit('update-available', { version: '5.1.0' }), {}))
    await u.check()
    fake.download.mockImplementationOnce(async () => (fake.emit('update-downloaded', { version: '5.1.0' }), []))
    await u.download()
    fake.check.mockClear()
    expect((await u.check()).state).toBe('ready')
    expect(fake.check).not.toHaveBeenCalled()
  })
})

describe('background check', () => {
  it('runs once after the delay and stays quiet when it fails', async () => {
    vi.useFakeTimers()
    try {
      const { u, fake, seen } = setup()
      fake.check.mockRejectedValueOnce(new Error('offline'))
      u.start()
      await vi.advanceTimersByTimeAsync(59_000)
      expect(fake.check).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(fake.check).toHaveBeenCalledTimes(1)
      expect(await u.status()).toMatchObject({ state: 'idle', error: null })
      expect(seen.some((s) => s.state === 'error')).toBe(false)
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      expect(fake.check).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('is skipped when switched off, and when unsupported', async () => {
    vi.useFakeTimers()
    try {
      const off = setup({ auto: false })
      off.u.start()
      const unsupported = setup({ supported: false })
      unsupported.u.start()
      await vi.advanceTimersByTimeAsync(120_000)
      expect(off.fake.check).not.toHaveBeenCalled()
      expect(unsupported.fake.check).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reads the setting when the timer fires, not at start', async () => {
    vi.useFakeTimers()
    try {
      const { u, fake, settings } = setup()
      u.start()
      await vi.advanceTimersByTimeAsync(1)
      settings.set(AUTO_KEY, false)
      await vi.advanceTimersByTimeAsync(120_000)
      expect(fake.check).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
