import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { AppError } from '../utils/AppError';

const formatZodIssues = (error: ZodError) =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || '_',
    message: issue.message,
  }));

export const validateBody =
  (schema: ZodSchema) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        AppError.unprocessable('بيانات الإدخال غير صحيحة', formatZodIssues(result.error)),
      );
      return;
    }
    req.body = result.data;
    next();
  };

export const validateQuery =
  (schema: ZodSchema) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(
        AppError.unprocessable('بيانات الاستعلام غير صحيحة', formatZodIssues(result.error)),
      );
      return;
    }
    // Query params are read-only in practice; keep them on a dedicated property.
    (req as Request & { validatedQuery?: unknown }).validatedQuery = result.data;
    next();
  };

export const validateParams =
  (schema: ZodSchema) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(
        AppError.unprocessable('معرّف الطلب غير صحيح', formatZodIssues(result.error)),
      );
      return;
    }
    (req as Request & { validatedParams?: unknown }).validatedParams = result.data;
    next();
  };

export const getQuery = <T>(req: Request): T =>
  ((req as Request & { validatedQuery?: T }).validatedQuery ??
    (req.query as unknown as T)) as T;

export const getParams = <T>(req: Request): T =>
  ((req as Request & { validatedParams?: T }).validatedParams ??
    (req.params as unknown as T)) as T;

export { formatZodIssues };
