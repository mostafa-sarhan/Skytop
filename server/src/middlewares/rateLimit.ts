import { NextFunction, Request, Response } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

const globalLimiter = new RateLimiterMemory({
  points: env.RATE_LIMIT_MAX,
  duration: Math.max(1, Math.round(env.RATE_LIMIT_WINDOW_MS / 1000)),
});

const loginLimiter = new RateLimiterMemory({
  points: env.LOGIN_RATE_LIMIT_MAX,
  duration: 60,
  blockDuration: 300,
});

const enforce =
  (limiter: RateLimiterMemory, keyPrefix: string) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await limiter.consume(`${keyPrefix}:${req.ip ?? 'unknown'}`);
      next();
    } catch {
      next(
        new AppError(429, 'عدد كبير من الطلبات، يرجى المحاولة بعد قليل', 'RATE_LIMITED'),
      );
    }
  };

export const rateLimit = enforce(globalLimiter, 'global');
export const loginRateLimit = enforce(loginLimiter, 'login');
