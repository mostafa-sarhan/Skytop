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

/**
 * Browsers send multipart file names as UTF-8, but busboy (via multer 1.x)
 * decodes them as Latin-1, so an Arabic name such as «فاتورة.png» would be
 * stored garbled. Re-decode; ASCII names are unchanged.
 */
const utf8Name = (name: string): string => {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
};

const fixFileNames = (req: Parameters<RequestHandler>[0]) => {
  const files = [
    ...(req.file ? [req.file] : []),
    ...(Array.isArray(req.files) ? req.files : Object.values(req.files ?? {}).flat()),
  ];
  for (const file of files) file.originalname = utf8Name(file.originalname);
};

/** Runs a multer handler and turns its errors into clear Arabic AppErrors. */
export const runMulter =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    handler(req, res, (error: unknown) => {
      if (!error) {
        fixFileNames(req);
        return next();
      }
      if (error instanceof AppError) return next(error);
      if (error instanceof multer.MulterError) {
        return next(AppError.badRequest(multerMessage(error), { field: error.field }));
      }
      return next(AppError.badRequest('تعذر رفع الملف'));
    });
  };
