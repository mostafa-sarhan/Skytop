import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validateParams, validateQuery } from '../middlewares/validate';
import * as reportController from '../controllers/report.controller';
import {
  expenseReportQuery,
  missingDocumentsQuery,
  paymentHistoryQuery,
  reportDelegateTripQuery,
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

// كشف معتمري مندوب داخل رحلة (from the delegate-trip workspace).
router.get(
  '/delegate-trip-pilgrims',
  validateQuery(reportDelegateTripQuery),
  asyncHandler(reportController.delegateTripPilgrimsJson),
);
router.get(
  '/delegate-trip-pilgrims/excel',
  validateQuery(reportDelegateTripQuery),
  asyncHandler(reportController.delegateTripPilgrimsExcel),
);
router.get(
  '/delegate-trip-pilgrims/pdf',
  validateQuery(reportDelegateTripQuery),
  asyncHandler(reportController.delegateTripPilgrimsPdf),
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

// Company expenses (same filters as the expenses list; voided excluded by default).
router.get('/expenses/excel', validateQuery(expenseReportQuery), asyncHandler(reportController.expensesExcel));
router.get('/expenses/pdf', validateQuery(expenseReportQuery), asyncHandler(reportController.expensesPdf));

export default router;
