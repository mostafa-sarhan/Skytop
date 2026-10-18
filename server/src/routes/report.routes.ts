import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validateParams, validateQuery } from '../middlewares/validate';
import * as reportController from '../controllers/report.controller';
import {
  delegateReportQuery,
  missingDocumentsQuery,
  paymentHistoryQuery,
  reportTripQuery,
  statementParams,
} from '../validators';

const router = Router();

router.get(
  '/trip-pilgrims',
  validateQuery(reportTripQuery),
  asyncHandler(reportController.tripPilgrimsJson),
);
router.get(
  '/trip-pilgrims/excel',
  validateQuery(reportTripQuery),
  asyncHandler(reportController.tripPilgrimsExcel),
);
router.get(
  '/trip-pilgrims/pdf',
  validateQuery(reportTripQuery),
  asyncHandler(reportController.tripPilgrimsPdf),
);

router.get(
  '/delegate-pilgrims',
  validateQuery(delegateReportQuery),
  asyncHandler(reportController.delegatePilgrimsJson),
);
router.get(
  '/delegate-pilgrims/excel',
  validateQuery(delegateReportQuery),
  asyncHandler(reportController.delegatePilgrimsExcel),
);
router.get(
  '/delegate-pilgrims/pdf',
  validateQuery(delegateReportQuery),
  asyncHandler(reportController.delegatePilgrimsPdf),
);

router.get(
  '/missing-documents',
  validateQuery(missingDocumentsQuery),
  asyncHandler(reportController.missingDocumentsJson),
);
router.get(
  '/missing-documents/excel',
  validateQuery(missingDocumentsQuery),
  asyncHandler(reportController.missingDocumentsExcel),
);
router.get(
  '/missing-documents/pdf',
  validateQuery(missingDocumentsQuery),
  asyncHandler(reportController.missingDocumentsPdf),
);

router.get(
  '/account-statement/:delegateId',
  validateParams(statementParams),
  asyncHandler(reportController.statementJson),
);
router.get(
  '/account-statement/:delegateId/excel',
  validateParams(statementParams),
  asyncHandler(reportController.statementExcel),
);
router.get(
  '/account-statement/:delegateId/pdf',
  validateParams(statementParams),
  asyncHandler(reportController.statementPdf),
);

router.get('/payments', validateQuery(paymentHistoryQuery), asyncHandler(reportController.paymentsJson));
router.get('/payments/excel', validateQuery(paymentHistoryQuery), asyncHandler(reportController.paymentsExcel));
router.get('/payments/pdf', validateQuery(paymentHistoryQuery), asyncHandler(reportController.paymentsPdf));

export default router;
