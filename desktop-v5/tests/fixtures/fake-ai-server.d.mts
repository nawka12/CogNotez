export interface FakeAiServer {
  port: number
  state: { count: number; lastAuth: string | null; lastBody: unknown; lastOllama: { model: string; num_ctx: number; temperature: number } | null }
  close(): Promise<void>
}
export function start(port?: number): Promise<FakeAiServer>
export function deadPort(): Promise<number>
