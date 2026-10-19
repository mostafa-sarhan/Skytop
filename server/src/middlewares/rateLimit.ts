import { NextFunction, Request, Response } from 'express';
import { RateLimiterAbstract, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

/**
 * Rate limits. The store is in-process memory, which is correct for the
 * planned deployment: ONE Node process on one VPS behind Nginx (limits reset
 * on restart). If the API ever runs as several processes / servers, swap
 * `createLimiter` to `RateLimiterRedis` (same rate-limiter-flexible API) —
 * nothing else changes. Client IPs come from Express `req.ip`, which only
 * trusts X-Forwarded-For from the configured proxy (see TRUST_PROXY).
 */
const createLimiter = (options: { points: number; duration: number; blockDuration?: number; keyPrefix: string }): RateLimiterAbstract =>
  new RateLimiterMemory(options);

const tooMany = (res: Response, retry: RateLimiterRes | unknown, message: string): AppError => {
  if (retry instanceof RateLimiterRes) res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retry.msBeforeNext / 1000))));
  return new AppError(429, message, 'RATE_LIMITED');
};

const BUSY = 'عدد كبير من الطلبات، يرجى المحاولة بعد قليل';

/** Express middleware consuming one point per request for `key(req)`. */
const enforce =
  (limiter: RateLimiterAbstract, key: (req: Request) => string, message = BUSY) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await limiter.consume(key(req));
      next();
    } catch (retry) {
      next(tooMany(res, retry, message));
    }
  };

const byIp = (req: Request) => req.ip ?? 'unknown';
const byUser = (req: Request) => req.user?.id ?? byIp(req);

/** All API traffic, per client IP. */
export const rateLimit = enforce(
  createLimiter({
    keyPrefix: 'global',
    points: env.RATE_LIMIT_MAX,
    duration: Math.max(1, Math.round(env.RATE_LIMIT_WINDOW_MS / 1000)),
  }),
  byIp,
);

/** Login attempts per IP (successful or not). */
export const loginRateLimit = enforce(
  createLimiter({ keyPrefix: 'login', points: env.LOGIN_RATE_LIMIT_MAX, duration: 60, blockDuration: 300 }),
  byIp,
  'محاولات دخول كثيرة، يرجى المحاولة بعد بضع دقائق',
);

/**
 * Failed logins per ACCOUNT (any IP): slows password guessing against one
 * username. Consumed only on failure and cleared on success.
 */
const loginFailures = createLimiter({
  keyPrefix: 'login_fail',
  points: env.LOGIN_FAILURES_PER_ACCOUNT,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});
const LOCKED = 'تم إيقاف محاولات الدخول لهذا الحساب مؤقتاً بسبب محاولات خاطئة متكررة، يرجى المحاولة بعد 15 دقيقة';

export const accountLock = {
  /** Throws 429 while the account is locked. */
  assertOpen: async (username: string): Promise<void> => {
    const state = await loginFailures.get(username);
    if (state && state.remainingPoints <= 0 && state.msBeforeNext > 0) throw new AppError(429, LOCKED, 'RATE_LIMITED');
  },
  recordFailure: async (username: string): Promise<void> => {
    await loginFailures.consume(username).catch(() => undefined);
  },
  reset: async (username: string): Promise<void> => {
    await loginFailures.delete(username);
  },
};

/** Own password changes, per user. */
export const passwordChangeRateLimit = enforce(
  createLimiter({ keyPrefix: 'pwd_change', points: env.SENSITIVE_RATE_LIMIT_MAX, duration: 15 * 60 }),
  byUser,
);

/** Manager actions on accounts (create, reset password, status), per manager. */
export const accountAdminRateLimit = enforce(
  createLimiter({ keyPrefix: 'account_admin', points: env.SENSITIVE_RATE_LIMIT_MAX * 6, duration: 15 * 60 }),
  byUser,
);

/** File uploads (documents, receipt scans, invoices), per user. */
export const uploadRateLimit = enforce(
  createLimiter({ keyPrefix: 'upload', points: env.UPLOAD_RATE_LIMIT_MAX, duration: 10 * 60 }),
  byUser,
  'عدد كبير من الملفات المرفوعة، يرجى المحاولة بعد قليل',
);
