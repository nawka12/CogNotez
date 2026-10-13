export interface FakeFile {
  id: string
  name: string
  mimeType: string
  parents: string[]
  appProperties: Record<string, string>
  createdTime: string
  trashed: boolean
  size?: string
  bytes?: Buffer
}
export interface FakeDrive {
  port: number
  /** Drive API base. */
  url: string
  /** OAuth base (`/auth`, `/token`, `/revoke`). */
  oauth: string
  state: {
    email: string
    expiresIn: number
    refreshInvalid: boolean
    requests: string[]
    tokenRequests: Record<string, string>[]
    revoked: (string | null)[]
    uploads: number
    /** Delay applied to every Drive request. */
    latencyMs: number
  }
  files(): FakeFile[]
  /** Answers the next `count` Drive requests whose "METHOD /path" matches with `status`. */
  fail(status: number, count?: number, match?: RegExp, reason?: string): void
  /** Leaves the next `count` Drive requests whose "METHOD /path" matches unanswered until close(). */
  stall(count?: number, match?: RegExp): void
  expireAccessTokens(): void
  token(): string
  /** Adds a file (or, with no bytes, a folder) the way another device would; returns its id. */
  seed(name: string, parents: string[], bytes?: Uint8Array, appProperties?: Record<string, string>): string
  close(): Promise<void>
}
export function parseQuery(q: string): ((f: FakeFile) => boolean)[]
export function start(port?: number): Promise<FakeDrive>
