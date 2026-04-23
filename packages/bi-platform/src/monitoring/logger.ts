/**
 * Structured JSON logger for the BI platform.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

export function createLogger(options?: {
  level?: LogLevel;
  context?: Record<string, unknown>;
}): Logger {
  const minLevel = LOG_LEVELS[options?.level ?? (process.env.BI_LOG_LEVEL as LogLevel) ?? 'info'];
  const baseContext = options?.context ?? {};

  function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < minLevel) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...baseContext,
      ...data,
    };

    const out = level === 'error' ? process.stderr : process.stdout;
    out.write(`${JSON.stringify(entry)}\n`);
  }

  const logger: Logger = {
    debug: (msg, data) => log('debug', msg, data),
    info: (msg, data) => log('info', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
    child(context) {
      return createLogger({
        level: options?.level,
        context: { ...baseContext, ...context },
      });
    },
  };

  return logger;
}
