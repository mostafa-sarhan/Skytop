import { Response } from 'express';
import { PaginatedResult } from '../types';

export const ok = <T>(res: Response, data: T, statusCode = 200): Response =>
  res.status(statusCode).json({ success: true, data });

export const created = <T>(res: Response, data: T): Response => ok(res, data, 201);

export const paginated = <T>(
  res: Response,
  result: PaginatedResult<T>,
  statusCode = 200,
): Response => ok(res, result, statusCode);
