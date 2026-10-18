import { Router } from 'express';
import { authorize } from '../middlewares/authorize';
import { asyncHandler } from '../utils/asyncHandler';
import { validateQuery } from '../middlewares/validate';
import * as auditController from '../controllers/audit.controller';
import { auditListQuery } from '../validators';

const router = Router();

router.use(authorize('MANAGER'));

router.get('/', validateQuery(auditListQuery), asyncHandler(auditController.list));
router.get('/actions', asyncHandler(auditController.actions));

export default router;
