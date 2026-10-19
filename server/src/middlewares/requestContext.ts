import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Request ID + one access-log line per request. The ID comes from Nginx
 * (`X-Request-Id: $request_id`) when it looks safe, otherwise it is generated;
 * it is echoed in the response header and in error bodies so a user can
 * quote it. Logged: method, path (no query string, no body), status,
 * duration, user ID and client IP.
 */
export const requestContext = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header('x-request-id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
    const path = `${req.baseUrl}${req.path}`;
    const meta = {
      requestId: req.id,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs,
      userId: req.user?.id,
      ip: req.ip,
    };
    if (path.endsWith('/health') || path.endsWith('/health/live')) logger.debug('request', meta);
    else logger.info('request', meta);
  });
  next();
};
