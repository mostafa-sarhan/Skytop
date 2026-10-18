import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { formatZodIssues } from './validate';
import { AppError } from '../utils/AppError';

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(AppError.notFound(`لا يوجد مسار بهذا العنوان: ${req.method} ${req.originalUrl}`));
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (res.headersSent) return;

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
    appError = AppError.internal();
  }

  const logMeta = {
    method: req.method,
    url: req.originalUrl,
    status: appError.statusCode,
    code: appError.code,
    userId: req.user?.id,
    requestId: req.header('x-request-id'),
  };

  if (appError.statusCode >= 500) {
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
      ...(env.NODE_ENV === 'development' && appError.statusCode >= 500 && err instanceof Error
        ? { stack: err.stack }
        : {}),
    },
  });
};

const mapPrismaError = (err: Prisma.PrismaClientKnownRequestError): AppError => {
  switch (err.code) {
    case 'P2002': {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'الحقل';
      return AppError.conflict('القيمة المدخلة موجودة مسبقاً، يرجى استخدام قيمة أخرى', {
        fields: target,
      });
    }
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
