import { Router } from 'express';
import { authorize } from '../middlewares/authorize';
import { runMulter, uploadSingle } from '../middlewares/upload';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate';
import { asyncHandler } from '../utils/asyncHandler';
import * as expenseController from '../controllers/expense.controller';
import { createExpenseSchema, expenseListQuery, uuidParam, voidExpenseSchema } from '../validators';

const router = Router();

router.get('/', validateQuery(expenseListQuery), asyncHandler(expenseController.list));
router.get('/summary', asyncHandler(expenseController.summary));
router.get('/:id', validateParams(uuidParam), asyncHandler(expenseController.getById));
router.get('/:id/attachment', validateParams(uuidParam), asyncHandler(expenseController.attachment));

// multipart/form-data: expense fields + optional `file` (invoice / receipt).
router.post('/', runMulter(uploadSingle), validateBody(createExpenseSchema), asyncHandler(expenseController.create));

// Expenses are never edited or deleted: there is intentionally no PATCH / PUT
// / DELETE. The only correction is a manager void, which keeps the record.
router.post(
  '/:id/void',
  authorize('MANAGER'),
  validateParams(uuidParam),
  validateBody(voidExpenseSchema),
  asyncHandler(expenseController.voidExpense),
);

export default router;
