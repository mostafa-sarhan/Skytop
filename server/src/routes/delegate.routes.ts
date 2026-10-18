import { Router } from 'express';
import { z } from 'zod';
import { DelegateStatus } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate';
import * as delegateController from '../controllers/delegate.controller';
import {
  createDelegateSchema,
  delegateListQuery,
  delegateTripPilgrimsQuery,
  delegateTripsQuery,
  updateDelegateSchema,
  uuid,
  uuidParam,
} from '../validators';

const statusSchema = z.object({ status: z.nativeEnum(DelegateStatus) }).strict();

const router = Router();

router.get('/', validateQuery(delegateListQuery), asyncHandler(delegateController.list));
router.get('/:id', validateParams(uuidParam), asyncHandler(delegateController.getById));
// Operational drill-down: delegate → trips → pilgrims of that delegate in that trip.
// Financial data is intentionally not exposed here (see /finance).
router.get(
  '/:id/trips',
  validateParams(uuidParam),
  validateQuery(delegateTripsQuery),
  asyncHandler(delegateController.trips),
);
router.get(
  '/:id/trips/:tripId/pilgrims',
  validateParams(z.object({ id: uuid, tripId: uuid })),
  validateQuery(delegateTripPilgrimsQuery),
  asyncHandler(delegateController.tripPilgrims),
);
router.post('/', validateBody(createDelegateSchema), asyncHandler(delegateController.create));
router.patch(
  '/:id',
  validateParams(uuidParam),
  validateBody(updateDelegateSchema),
  asyncHandler(delegateController.update),
);
router.post(
  '/:id/status',
  validateParams(uuidParam),
  validateBody(statusSchema),
  asyncHandler(delegateController.changeStatus),
);

export default router;
