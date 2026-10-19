import { Router } from 'express';
import { authorize } from '../middlewares/authorize';
import { accountAdminRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate';
import * as userController from '../controllers/user.controller';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  usersListQuery,
  uuidParam,
} from '../validators';

const router = Router();

router.use(authorize('MANAGER'));

router.get('/', validateQuery(usersListQuery), asyncHandler(userController.list));
router.get('/roles', asyncHandler(userController.roles));
router.post('/', accountAdminRateLimit, validateBody(createUserSchema), asyncHandler(userController.create));
router.patch(
  '/:id',
  accountAdminRateLimit,
  validateParams(uuidParam),
  validateBody(updateUserSchema),
  asyncHandler(userController.update),
);
router.post(
  '/:id/reset-password',
  accountAdminRateLimit,
  validateParams(uuidParam),
  validateBody(resetPasswordSchema),
  asyncHandler(userController.resetPassword),
);

export default router;
