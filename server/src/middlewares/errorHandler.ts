import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { formatZodIssues } from './validate';
import { AppError } from '../utils/AppError';

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(AppError.notFound(`لا يوجد مسار بهذا العنوان: ${req.method} ${req.path}`));
};

/** Errors raised by Express' body parsers (http-errors with a 4xx status). */
const bodyParserError = (err: unknown): AppError | null => {
  const e = err as { type?: unknown; status?: unknown; expose?: unknown };
  if (typeof e?.status !== 'number' || e.status < 400 || e.status >= 500 || e.expose !== true) return null;
  if (e.type === 'entity.too.large') return new AppError(413, 'حجم البيانات المرسلة أكبر من المسموح', 'PAYLOAD_TOO_LARGE');
  if (e.type === 'entity.parse.failed') return AppError.badRequest('صيغة البيانات المرسلة غير صحيحة');
  return new AppError(e.status, 'طلب غير صالح', 'BAD_REQUEST');
};

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Failed mid-response (e.g. a file stream broke): let Express close the
  // connection instead of leaving the client hanging.
  if (res.headersSent) {
    logger.error('response_failed_after_headers', { method: req.method, path: req.path, error: err });
    next(err);
    return;
  }

  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = AppError.unprocessable('بيانات الإدخال غير صحيحة', formatZodIssues(err));
  } else if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'حجم الملف يتجاوز الحد المسموح'
        : 'تعذر رفع الملف، يرجى المحاولة مرة أخرى';
    appError = AppError.badRequest(message, { code: err.code });
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    appError = mapPrismaError(err);
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    appError = AppError.badRequest('طلب غير صالح من التطبيق');
  } else {
    appError = bodyParserError(err) ?? AppError.internal();
  }

  const logMeta = {
    method: req.method,
    url: req.originalUrl,
    status: appError.statusCode,
    code: appError.code,
    userId: req.user?.id,
    requestId: req.id,
  };

  if (appError.statusCode >= 500) {
    // Full technical detail stays in the server log only.
    logger.error('request_failed', { ...logMeta, error: err });
  } else {
    logger.warn('request_rejected', { ...logMeta, message: appError.message });
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
      requestId: req.id,
      ...(env.NODE_ENV === 'development' && appError.statusCode >= 500 && err instanceof Error
        ? { stack: err.stack }
        : {}),
    },
  });
};

const mapPrismaError = (err: Prisma.PrismaClientKnownRequestError): AppError => {
  switch (err.code) {
    case 'P2002':
      // Column / constraint names are internal: never sent to the client.
      return AppError.conflict('القيمة المدخلة موجودة مسبقاً، يرجى استخدام قيمة أخرى');
    case 'P2025':
      return AppError.notFound();
    case 'P2003':
      return AppError.badRequest('لا يمكن تنفيذ العملية لوجود سجلات مرتبطة بها');
    case 'P2014':
      return AppError.badRequest('تعذر تنفيذ العملية بسبب تعارض في السجلات المرتبطة');
    default:
      return AppError.internal();
  }
};
