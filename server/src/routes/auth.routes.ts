import { Router } from 'express';
import { loginRateLimit, passwordChangeRateLimit } from '../middlewares/rateLimit';
import { validateBody } from '../middlewares/validate';
import { asyncHandler } from '../utils/asyncHandler';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { changePasswordSchema, loginSchema } from '../validators';

const router = Router();

router.post('/login', loginRateLimit, validateBody(loginSchema), asyncHandler(authController.login));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.me));
router.post(
  '/change-password',
  authenticate,
  passwordChangeRateLimit,
  validateBody(changePasswordSchema),
  asyncHandler(authController.changePassword),
);

export default router;
