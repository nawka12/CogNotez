/* Levelled logger: the only module allowed to use console (see eslint.config.mjs). */
import { app } from 'electron'

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const
type Level = keyof typeof LEVELS

const min = (): number => (app.isPackaged ? LEVELS.info : LEVELS.debug)

function emit(level: Level, args: unknown[]): void {
  if (LEVELS[level] < min()) return
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  out(`[${new Date().toISOString()}] ${level.toUpperCase()}`, ...args)
}

export const log = {
  debug: (...a: unknown[]): void => emit('debug', a),
  info: (...a: unknown[]): void => emit('info', a),
  warn: (...a: unknown[]): void => emit('warn', a),
  error: (...a: unknown[]): void => emit('error', a)
}
