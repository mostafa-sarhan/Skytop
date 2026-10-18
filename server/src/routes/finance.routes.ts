import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../middlewares/authorize';
import { asyncHandler } from '../utils/asyncHandler';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate';
import * as paymentController from '../controllers/payment.controller';
import {
  adjustmentListQuery,
  correctionSchema,
  delegateAccountsQuery,
  movementListQuery,
  refundSchema,
  uuid,
} from '../validators';

const delegateParams = z.object({ delegateId: uuid });
const managerOnly = authorize('MANAGER');

const router = Router();

// سجل الحركات المالية: manager only. Employees use the delegate account.
router.get(
  '/movements',
  managerOnly,
  validateQuery(movementListQuery),
  asyncHandler(paymentController.movements),
);
// حسابات المناديب: account summaries for all delegates (both roles).
router.get('/delegates', validateQuery(delegateAccountsQuery), asyncHandler(paymentController.delegateAccounts));
router.get(
  '/delegates/:delegateId/balance',
  validateParams(delegateParams),
  asyncHandler(paymentController.balance),
);
router.get(
  '/delegates/:delegateId/statement',
  validateParams(delegateParams),
  asyncHandler(paymentController.statement),
);

router.post('/refunds', managerOnly, validateBody(refundSchema), asyncHandler(paymentController.refund));
router.post(
  '/corrections',
  managerOnly,
  validateBody(correctionSchema),
  asyncHandler(paymentController.correction),
);
router.get(
  '/adjustments',
  managerOnly,
  validateQuery(adjustmentListQuery),
  asyncHandler(paymentController.listAdjustments),
);

export default router;
