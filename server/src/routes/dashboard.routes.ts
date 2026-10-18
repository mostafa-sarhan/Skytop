import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as dashboardController from '../controllers/dashboard.controller';

const router = Router();

router.get('/stats', asyncHandler(dashboardController.overview));

export default router;
