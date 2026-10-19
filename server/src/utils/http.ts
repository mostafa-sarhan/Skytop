import fs from 'fs';
import { Response } from 'express';
import { contentDisposition } from './contentDisposition';
import { PaginatedResult } from '../types';

export const ok = <T>(res: Response, data: T, statusCode = 200): Response =>
  res.status(statusCode).json({ success: true, data });

export const created = <T>(res: Response, data: T): Response => ok(res, data, 201);

export const paginated = <T>(
  res: Response,
  result: PaginatedResult<T>,
  statusCode = 200,
): Response => ok(res, result, statusCode);

/**
 * Streams a private file (passport / photo / receipt scan / invoice) that an
 * authenticated endpoint has already authorized. The type was verified from
 * the file's bytes at upload; responses are never cached by shared caches
 * and are shown inline with a safe (RFC 5987) file name.
 */
export const sendPrivateFile = (
  res: Response,
  file: { absolutePath: string; mime: string; originalName: string; size?: number },
): Promise<void> => {
  res.setHeader('Content-Type', file.mime);
  if (file.size !== undefined) res.setHeader('Content-Length', String(file.size));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', contentDisposition('inline', file.originalName));
  return new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(file.absolutePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
};
