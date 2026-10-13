// The shared Transport contract (tests/sync-transport-conformance.ts) against the Drive transport and the fake server.
import { afterAll, beforeAll } from 'vitest'
import { createDriveTransport } from '../src/main/sync/drive'
import { start } from './fixtures/fake-drive-server.mjs'
import type { FakeDrive } from './fixtures/fake-drive-server.mjs'
import { runConformance } from './sync-transport-conformance'

let drive: FakeDrive
beforeAll(async () => {
  drive = await start(0)
})
afterAll(() => drive.close())

runConformance(
  'gdrive + fake server',
  () => createDriveTransport({ getAccessToken: async () => drive.token(), apiBase: drive.url, sleep: async () => undefined }),
  { incremental: true }
)
