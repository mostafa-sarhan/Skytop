import { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

// Files are kept in memory only until validated and written to private storage.
const storage = multer.memoryStorage();

export const uploadSingle = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
}).single('file');

/** New pilgrim: required passport image + optional personal photo. */
export const uploadPilgrimCreateFiles = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 2 },
}).fields([
  { name: 'passportImage', maxCount: 1 },
  { name: 'personalPhoto', maxCount: 1 },
]);

const multerMessage = (error: multer.MulterError): string => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return `حجم الملف يتجاوز الحد المسموح (${Math.round(env.MAX_UPLOAD_BYTES / (1024 * 1024))} ميجابايت)`;
  }
  if (error.code === 'LIMIT_UNEXPECTED_FILE') return 'ملف غير متوقع في الطلب';
  return 'تعذر رفع الملف';
};

/** Runs a multer handler and turns its errors into clear Arabic AppErrors. */
export const runMulter =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    handler(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof AppError) return next(error);
      if (error instanceof multer.MulterError) {
        return next(AppError.badRequest(multerMessage(error), { field: error.field }));
      }
      return next(AppError.badRequest('تعذر رفع الملف'));
    });
  };
