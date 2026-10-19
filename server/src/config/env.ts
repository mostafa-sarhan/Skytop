import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

/**
 * Central, validated configuration. Every setting comes from the environment
 * (systemd EnvironmentFile in production, server/.env in development); the
 * process refuses to start when a value is missing or unsafe. In production
 * there are no silent development fallbacks: see `productionRules`.
 */

// Development / tests: server/.env fills variables that are not already set
// (from src/ via tsx or dist/src/ when compiled). Production reads ONLY the
// process environment (systemd EnvironmentFile): a stray .env in the release
// folder can never supply production values.
if (process.env.NODE_ENV !== 'production') {
  const serverRoot = [path.resolve(__dirname, '../..'), path.resolve(__dirname, '../../..')].find((dir) =>
    fs.existsSync(path.join(dir, 'package.json')),
  );
  if (serverRoot) dotenv.config({ path: path.join(serverRoot, '.env') });
}

const bool = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

const PLACEHOLDER = /CHANGE_ME|YOUR_|PLACEHOLDER|example\.com/i;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /** Interface to listen on. Production behind Nginx: 127.0.0.1 (not reachable from outside). */
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgresql:// connection string'),
  JWT_SECRET: z.string({ required_error: 'JWT_SECRET is required' }).min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, 'JWT_EXPIRES_IN must look like 12h, 30m or 1d').default('12h'),
  /** Send the session cookie only over HTTPS. Required in production. */
  COOKIE_SECURE: bool('false'),
  /** Comma-separated list of allowed browser origins (the public site URL in production). */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /**
   * Which proxy hops Express trusts for the client IP (X-Forwarded-For):
   * "false" (direct), "loopback" (Nginx on the same machine — recommended),
   * a hop count, or comma-separated addresses / subnets.
   */
  TRUST_PROXY: z.string().default('false'),
  /** Private uploads (passports, photos, receipt scans, invoices). Absolute path in production. */
  UPLOAD_DIR: z.string().min(1).default('uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().max(50 * 1024 * 1024).default(8 * 1024 * 1024),
  /** Optional: serve the built client from the API process (local rehearsal only; Nginx does this in production). */
  SERVE_CLIENT_DIR: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  // Per client IP. Office staff usually share one public IP (NAT), so this is
  // sized for the whole office; login has its own stricter limits.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1200),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_FAILURES_PER_ACCOUNT: z.coerce.number().int().positive().default(10),
  SENSITIVE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).optional(),
});

type ParsedEnv = z.infer<typeof envSchema>;

const productionRules = (value: ParsedEnv, ctx: z.RefinementCtx) => {
  if (value.NODE_ENV !== 'production') return;
  const fail = (key: keyof ParsedEnv, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });

  if (PLACEHOLDER.test(value.JWT_SECRET)) fail('JWT_SECRET', 'still contains a placeholder value');
  if (new Set(value.JWT_SECRET).size < 10) fail('JWT_SECRET', 'is not random enough (use `openssl rand -hex 32`)');
  if (PLACEHOLDER.test(value.DATABASE_URL)) fail('DATABASE_URL', 'still contains a placeholder value');
  if (!value.COOKIE_SECURE) fail('COOKIE_SECURE', 'must be true in production (HTTPS only)');
  if (!process.env.CORS_ORIGIN) fail('CORS_ORIGIN', 'must be set explicitly in production (e.g. https://your-domain)');
  for (const origin of value.CORS_ORIGIN.split(',').map((o) => o.trim())) {
    if (origin === '*' || origin === '') fail('CORS_ORIGIN', 'must list explicit origins (no wildcard)');
    else if (!/^https?:\/\/[^/]+$/.test(origin)) fail('CORS_ORIGIN', `"${origin}" is not an origin like https://your-domain`);
    else if (PLACEHOLDER.test(origin)) fail('CORS_ORIGIN', `"${origin}" is a placeholder`);
  }
  if (!path.isAbsolute(value.UPLOAD_DIR)) {
    fail('UPLOAD_DIR', 'must be an absolute path outside the release folder in production (e.g. /var/lib/skytop/uploads)');
  }
  if (!process.env.TRUST_PROXY) fail('TRUST_PROXY', 'must be set explicitly in production ("loopback" behind Nginx on the same server)');
};

const parsed = envSchema.superRefine(productionRules).safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message (values are never printed).
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n- ${issues.join('\n- ')}`);
}

/** Express "trust proxy" value from TRUST_PROXY. */
const trustProxy = (raw: string): boolean | number | string => {
  if (raw === 'false') return false;
  if (raw === 'true') {
    // "Trust everyone" would let any client spoof its IP (and dodge rate limits).
    throw new Error('Invalid environment configuration:\n- TRUST_PROXY: "true" is unsafe; use "loopback" or the proxy address');
  }
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
};

export const env = { ...parsed.data, TRUST_PROXY: trustProxy(parsed.data.TRUST_PROXY) };
export type Env = typeof env;
