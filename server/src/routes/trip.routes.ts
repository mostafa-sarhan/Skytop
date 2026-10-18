import { Router } from 'express';
import { z } from 'zod';
import { TripStatus } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate';
import * as tripController from '../controllers/trip.controller';
import {
  assignDelegateSchema,
  createTripSchema,
  tripListQuery,
  updatePriceSchema,
  updateTripSchema,
  uuid,
  uuidParam,
} from '../validators';

const tripDelegateParams = z.object({ id: uuid, delegateId: uuid });
const tripStatusSchema = z.object({ status: z.nativeEnum(TripStatus) }).strict();

const router = Router();

router.get('/', validateQuery(tripListQuery), asyncHandler(tripController.list));
router.get('/:id', validateParams(uuidParam), asyncHandler(tripController.getById));

router.post('/', validateBody(createTripSchema), asyncHandler(tripController.create));
router.patch(
  '/:id',
  validateParams(uuidParam),
  validateBody(updateTripSchema),
  asyncHandler(tripController.update),
);
router.post(
  '/:id/status',
  validateParams(uuidParam),
  validateBody(tripStatusSchema),
  asyncHandler(tripController.changeStatus),
);

router.post(
  '/:id/delegates',
  validateParams(uuidParam),
  validateBody(assignDelegateSchema),
  asyncHandler(tripController.assignDelegate),
);

router.patch(
  '/:id/delegates/:delegateId/price',
  validateParams(tripDelegateParams),
  validateBody(updatePriceSchema),
  asyncHandler(tripController.updateDelegatePrice),
);

export default router;
