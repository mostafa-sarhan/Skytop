import { Router } from 'express';
import { DocumentType } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { validateParams } from '../middlewares/validate';
import * as pilgrimController from '../controllers/pilgrim.controller';

const downloadParams = z.object({
  pilgrimId: z.string().uuid(),
  type: z.nativeEnum(DocumentType),
});

const router = Router();

router.get(
  '/:pilgrimId/:type',
  validateParams(downloadParams),
  asyncHandler(pilgrimController.downloadDocument),
);

export default router;
