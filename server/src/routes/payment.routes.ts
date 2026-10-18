import { Router } from 'express';
import { authorize } from '../middlewares/authorize';
import { asyncHandler } from '../utils/asyncHandler';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate';
import { runMulter, uploadSingle } from '../middlewares/upload';
import * as paymentController from '../controllers/payment.controller';
import { createPaymentSchema, paymentListQuery, uuidParam, voidPaymentSchema } from '../validators';

// Shared upload wrapper: same limits, Arabic error messages, and UTF-8 file
// names (Arabic receipt names such as «إيصال تحويل.jpg» are kept intact).
const runUpload = runMulter(uploadSingle, 'تعذر رفع صورة الإيصال');

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
