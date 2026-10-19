import winston from 'winston';

/**
 * Structured logs: JSON lines in production (journald / any collector),
 * readable lines in development, silent in tests. Values under sensitive keys
 * are replaced before anything is written, and Error objects are reduced to
 * name / message / code / stack (never request bodies or file contents).
 */

const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|jwt|hash|database_?url|signature/i;
const MAX_DEPTH = 5;

const scrub = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) {
    const err = value as Error & { code?: unknown; status?: unknown };
    return {
      name: err.name,
      message: err.message,
      ...(err.code !== undefined ? { code: err.code } : {}),
      ...(err.status !== undefined ? { status: err.status } : {}),
      stack: err.stack,
    };
  }
  if (Buffer.isBuffer(value)) return `[buffer ${value.length} bytes]`;
  if (depth >= MAX_DEPTH) return '[…]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => scrub(item, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE.test(key) ? '[REDACTED]' : scrub(val, depth + 1, seen);
  }
  return out;
};

const redact = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp') continue;
    info[key] = SENSITIVE.test(key) ? '[REDACTED]' : scrub(info[key]);
  }
  return info;
});

const production = process.env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? (production ? 'info' : 'debug'),
  format: winston.format.combine(redact(), winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'sky-top-api' },
  transports: [
    new winston.transports.Console({
      format: production
        ? winston.format.json()
        : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
  silent: process.env.NODE_ENV === 'test',
});
