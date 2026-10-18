import { Router } from 'express';
import { DocumentType } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate';
import { runMulter, uploadPilgrimCreateFiles, uploadSingle } from '../middlewares/upload';
import * as pilgrimController from '../controllers/pilgrim.controller';
import {
  cancelPilgrimSchema,
  createPilgrimSchema,
  pilgrimListQuery,
  transferPilgrimSchema,
  updatePilgrimSchema,
  uuid,
  uuidParam,
} from '../validators';

const documentParams = z.object({ id: uuid, type: z.nativeEnum(DocumentType) });

const runUpload = runMulter(uploadSingle);

const router = Router();

router.get('/', validateQuery(pilgrimListQuery), asyncHandler(pilgrimController.list));
router.get('/filter-options', asyncHandler(pilgrimController.filterOptions));
router.get('/:id', validateParams(uuidParam), asyncHandler(pilgrimController.getById));
// multipart/form-data: pilgrim fields + `passportImage` (required) +
// `personalPhoto` (optional). Created atomically with its documents.
router.post(
  '/',
  runMulter(uploadPilgrimCreateFiles),
  validateBody(createPilgrimSchema),
  asyncHandler(pilgrimController.create),
);
router.patch(
  '/:id',
  validateParams(uuidParam),
  validateBody(updatePilgrimSchema),
  asyncHandler(pilgrimController.update),
);
// استبعاد: employee or manager (any authenticated role). Never a hard delete.
router.post(
  '/:id/cancel',
  validateParams(uuidParam),
  validateBody(cancelPilgrimSchema),
  asyncHandler(pilgrimController.cancel),
);
router.post(
  '/:id/transfer',
  validateParams(uuidParam),
  validateBody(transferPilgrimSchema),
  asyncHandler(pilgrimController.transfer),
);

router.get('/:id/documents', validateParams(uuidParam), asyncHandler(pilgrimController.listDocuments));
router.post(
  '/:id/documents',
  validateParams(uuidParam),
  runUpload,
  asyncHandler(pilgrimController.uploadDocument),
);
router.delete(
  '/:id/documents/:type',
  validateParams(documentParams),
  asyncHandler(pilgrimController.deleteDocument),
);

export default router;
