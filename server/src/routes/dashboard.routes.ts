import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as reportController from '../controllers/report.controller';

const router = Router();

router.get('/stats', asyncHandler(reportController.dashboardStats));

export default router;
