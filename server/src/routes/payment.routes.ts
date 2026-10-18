import { RequestHandler, Router } from 'express';
import { authorize } from '../middlewares/authorize';
import { asyncHandler } from '../utils/asyncHandler';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate';
import { uploadSingle } from '../middlewares/upload';
import { AppError } from '../utils/AppError';
import * as paymentController from '../controllers/payment.controller';
import { createPaymentSchema, paymentListQuery, uuidParam, voidPaymentSchema } from '../validators';

const runUpload: RequestHandler = (req, res, next) => {
  uploadSingle(req, res, (error: unknown) => {
    if (error) {
      next(error instanceof AppError ? error : AppError.badRequest('تعذر رفع صورة الإيصال'));
      return;
    }
    next();
  });
};

const router = Router();

router.get('/', validateQuery(paymentListQuery), asyncHandler(paymentController.list));
router.get('/:id', validateParams(uuidParam), asyncHandler(paymentController.getById));
router.get(
  '/:id/receipt-scan',
  validateParams(uuidParam),
  asyncHandler(paymentController.receiptScan),
);

// multipart/form-data: payment fields + `file` (the physical receipt scan).
router.post(
  '/',
  runUpload,
  validateBody(createPaymentSchema),
  asyncHandler(paymentController.create),
);

// Payments are immutable: there is intentionally no PATCH / PUT / DELETE.
// The only exceptional action is a manager void, which preserves history.
router.post(
  '/:id/void',
  authorize('MANAGER'),
  validateParams(uuidParam),
  validateBody(voidPaymentSchema),
  asyncHandler(paymentController.voidPayment),
);

export default router;
