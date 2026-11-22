// Structured JSON logs to stdout (Railway collects them). Never log PII, tokens or message bodies:
// `data` always goes through redact().
import { redactRecord } from './redact.ts';

type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(minLevel: Level = 'info', base: Record<string, unknown> = {}) {
  const write = (level: Level, msg: string, data?: Record<string, unknown>) => {
    if (order[level] < order[minLevel]) return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      msg,
      ...base,
      ...(data ? redactRecord(data) : {}),
    });
    if (level === 'error' || level === 'warn') console.error(line);
    else console.log(line);
  };
  return {
    debug: (msg: string, data?: Record<string, unknown>) => write('debug', msg, data),
    info: (msg: string, data?: Record<string, unknown>) => write('info', msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => write('warn', msg, data),
    error: (msg: string, data?: Record<string, unknown>) => write('error', msg, data),
  };
}
