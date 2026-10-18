import { Response } from 'express';
import { Request } from 'express';
import { getParams, getQuery } from '../middlewares/validate';
import * as reportService from '../services/report.service';
import * as accountService from '../services/delegateAccount.service';
import { getActor } from '../utils/actor';
import { ok } from '../utils/http';
import { buildExcelBuffer, ExcelColumn } from '../modules/excel/excel';
import { renderStatementPdf, renderTablePdf } from '../modules/pdf/reports.pdf';
import { formatArabicDate, formatMoney } from '../modules/pdf/format';
import { contentDisposition } from '../utils/contentDisposition';
import {
  TripReportQuery,
  DelegateReportQuery,
  MissingDocumentsQuery,
  StatementParams,
  PaymentHistoryQuery,
} from '../validators';

const sendPdf = (res: Response, buffer: Buffer, filename: string): void => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', contentDisposition('attachment', filename));
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).send(buffer);
};

const sendExcel = (res: Response, buffer: Buffer, filename: string): void => {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', contentDisposition('attachment', filename));
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).send(buffer);
};

const docStatusLabel = (status: string): string => {
  switch (status) {
    case 'COMPLETE':
      return 'مكتمل';
    case 'MISSING_PASSPORT':
      return 'صورة جواز السفر ناقصة';
    case 'MISSING_PHOTO':
      return 'الصورة الشخصية ناقصة';
    default:
      return 'صورة الجواز والصورة الشخصية ناقصتان';
  }
};

const methodLabel = (value: string): string => (value === 'CASH' ? 'نقداً' : 'تحويل');
const transferLabel = (value?: string | null): string =>
  value === 'INSTAPAY' ? 'انستاباي' : value === 'BANK_TRANSFER' ? 'تحويل بنكي' : '';
const statusLabel = (value: string): string => (value === 'VOIDED' ? 'ملغي' : 'ساري');

const dateOnly = (value?: string | Date | null): string =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

// ---------------------------------------------------------------------------
// Trip pilgrims list
// ---------------------------------------------------------------------------

export const tripPilgrimsJson = async (req: Request, res: Response): Promise<void> => {
  const { tripId } = getQuery<TripReportQuery>(req);
  ok(res, await reportService.tripPilgrimsReport(tripId));
};

const tripPilgrimColumns: ExcelColumn[] = [
  { key: 'index', header: 'م', width: 6 },
  { key: 'name', header: 'اسم المعتمر', width: 28 },
  { key: 'passportNumber', header: 'جواز السفر', width: 16 },
  { key: 'nationalId', header: 'رقم الهوية', width: 16 },
  { key: 'birthDate', header: 'تاريخ الميلاد', width: 14 },
  { key: 'job', header: 'المهنة', width: 16 },
  { key: 'delegateName', header: 'المندوب', width: 22 },
  { key: 'documentStatus', header: 'حالة الوثائق', width: 24 },
];

export const tripPilgrimsExcel = async (req: Request, res: Response): Promise<void> => {
  const { tripId } = getQuery<TripReportQuery>(req);
  const report = await reportService.tripPilgrimsReport(tripId);
  const buffer = await buildExcelBuffer({
    sheetName: 'معتمرو الرحلة',
    title: `${report.meta.title} — ${report.trip.name}`,
    columns: tripPilgrimColumns,
    rows: report.rows.map((row) => ({ ...row, documentStatus: docStatusLabel(row.documentStatus) })),
    summary: [
      { label: 'إجمالي المعتمرين', value: report.summary.total },
      { label: 'وثائق مكتملة', value: report.summary.completeDocuments },
      { label: 'وثائق ناقصة', value: report.summary.incompleteDocuments },
    ],
  });
  sendExcel(res, buffer, `trip-pilgrims-${report.trip.name}.xlsx`);
};

export const tripPilgrimsPdf = async (req: Request, res: Response): Promise<void> => {
  const { tripId } = getQuery<TripReportQuery>(req);
  const report = await reportService.tripPilgrimsReport(tripId);
  const buffer = await renderTablePdf({
    title: report.meta.title,
    subtitle: report.trip.name,
    meta: {
      'تاريخ المغادرة': report.trip.departureDate,
      'تاريخ العودة': report.trip.returnDate,
    },
    columns: tripPilgrimColumns.map((c) => ({ key: c.key, header: c.header, width: c.width * 1.15 })),
    rows: report.rows.map((row) => ({ ...row, documentStatus: docStatusLabel(row.documentStatus) })),
    landscape: true,
    summary: [
      { label: 'إجمالي المعتمرين', value: String(report.summary.total) },
      { label: 'وثائق مكتملة', value: String(report.summary.completeDocuments) },
      { label: 'وثائق ناقصة', value: String(report.summary.incompleteDocuments) },
    ],
  });
  sendPdf(res, buffer, `trip-pilgrims-${report.trip.name}.pdf`);
};

// ---------------------------------------------------------------------------
// Delegate pilgrims list
// ---------------------------------------------------------------------------

export const delegatePilgrimsJson = async (req: Request, res: Response): Promise<void> => {
  const { delegateId } = getQuery<DelegateReportQuery>(req);
  ok(res, await reportService.delegatePilgrimsReport(delegateId));
};

const delegatePilgrimColumns: ExcelColumn[] = [
  { key: 'index', header: 'م', width: 6 },
  { key: 'name', header: 'اسم المعتمر', width: 28 },
  { key: 'passportNumber', header: 'جواز السفر', width: 16 },
  { key: 'nationalId', header: 'رقم الهوية', width: 16 },
  { key: 'tripName', header: 'الرحلة', width: 24 },
  { key: 'documentStatus', header: 'حالة الوثائق', width: 24 },
];

export const delegatePilgrimsExcel = async (req: Request, res: Response): Promise<void> => {
  const { delegateId } = getQuery<DelegateReportQuery>(req);
  const report = await reportService.delegatePilgrimsReport(delegateId);
  const buffer = await buildExcelBuffer({
    sheetName: 'معتمرو المندوب',
    title: `${report.meta.title} — ${report.delegate.name}`,
    columns: delegatePilgrimColumns,
    rows: report.rows.map((row) => ({ ...row, documentStatus: docStatusLabel(row.documentStatus) })),
    summary: [
      { label: 'إجمالي المعتمرين', value: report.summary.total },
      { label: 'إجمالي المطلوب عن الرحلات', value: report.summary.tripsRequired },
    ],
  });
  sendExcel(res, buffer, `delegate-pilgrims-${report.delegate.name}.xlsx`);
};

export const delegatePilgrimsPdf = async (req: Request, res: Response): Promise<void> => {
  const { delegateId } = getQuery<DelegateReportQuery>(req);
  const report = await reportService.delegatePilgrimsReport(delegateId);
  const buffer = await renderTablePdf({
    title: report.meta.title,
    subtitle: report.delegate.name,
    meta: { الهاتف: report.delegate.phone },
    columns: delegatePilgrimColumns.map((c) => ({
      key: c.key,
      header: c.header,
      width: c.width * 1.3,
    })),
    rows: report.rows.map((row) => ({ ...row, documentStatus: docStatusLabel(row.documentStatus) })),
    landscape: true,
    summary: [
      { label: 'إجمالي المعتمرين', value: String(report.summary.total) },
      { label: 'إجمالي المطلوب عن الرحلات', value: formatMoney(report.summary.tripsRequired) },
    ],
  });
  sendPdf(res, buffer, `delegate-pilgrims-${report.delegate.name}.pdf`);
};

// ---------------------------------------------------------------------------
// Missing documents
// ---------------------------------------------------------------------------

export const missingDocumentsJson = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<MissingDocumentsQuery>(req);
  ok(res, await reportService.missingDocumentsReport(query));
};

const missingDocColumns: ExcelColumn[] = [
  { key: 'name', header: 'اسم المعتمر', width: 28 },
  { key: 'passportNumber', header: 'جواز السفر', width: 16 },
  { key: 'tripName', header: 'الرحلة', width: 22 },
  { key: 'delegateName', header: 'المندوب', width: 22 },
  { key: 'hasPassportImage', header: 'صورة الجواز', width: 14 },
  { key: 'hasPersonalPhoto', header: 'الصورة الشخصية', width: 14 },
];

const yesNo = (value: boolean): string => (value ? 'موجودة' : 'ناقصة');

export const missingDocumentsExcel = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<MissingDocumentsQuery>(req);
  const report = await reportService.missingDocumentsReport(query);
  const buffer = await buildExcelBuffer({
    sheetName: 'الوثائق الناقصة',
    title: report.meta.title,
    columns: missingDocColumns,
    rows: report.rows.map((row) => ({
      ...row,
      hasPassportImage: yesNo(row.hasPassportImage),
      hasPersonalPhoto: yesNo(row.hasPersonalPhoto),
    })),
    summary: [
      { label: 'إجمالي المعتمرين', value: report.summary.total },
      { label: 'حالات ناقصة', value: report.summary.incomplete },
      { label: 'ناقصة صورة الجواز', value: report.summary.missingPassport },
      { label: 'ناقصة الصورة الشخصية', value: report.summary.missingPhoto },
    ],
  });
  sendExcel(res, buffer, 'missing-documents.xlsx');
};

export const missingDocumentsPdf = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<MissingDocumentsQuery>(req);
  const report = await reportService.missingDocumentsReport(query);
  const buffer = await renderTablePdf({
    title: report.meta.title,
    meta: {
      ...(report.meta.filters.trip ? { الرحلة: report.meta.filters.trip } : {}),
      ...(report.meta.filters.delegate ? { المندوب: report.meta.filters.delegate } : {}),
    },
    columns: missingDocColumns.map((c) => ({ key: c.key, header: c.header, width: c.width * 1.3 })),
    rows: report.rows.map((row) => ({
      ...row,
      hasPassportImage: yesNo(row.hasPassportImage),
      hasPersonalPhoto: yesNo(row.hasPersonalPhoto),
    })),
    landscape: true,
    summary: [
      { label: 'إجمالي المعتمرين', value: String(report.summary.total) },
      { label: 'حالات ناقصة', value: String(report.summary.incomplete) },
      { label: 'ناقصة صورة الجواز', value: String(report.summary.missingPassport) },
      { label: 'ناقصة الصورة الشخصية', value: String(report.summary.missingPhoto) },
    ],
  });
  sendPdf(res, buffer, 'missing-documents.pdf');
};

// ---------------------------------------------------------------------------
// Delegate account (حساب المندوب)
// ---------------------------------------------------------------------------

const accountStatusLabel = (status: string): string =>
  status === 'DUE' ? 'عليه مبلغ' : status === 'CREDIT' ? 'له رصيد' : 'مسدد';

const statementColumns: ExcelColumn[] = [
  { key: 'description', header: 'البيان', width: 40 },
  { key: 'date', header: 'التاريخ', width: 14 },
  { key: 'count', header: 'عدد المعتمرين', width: 12 },
  { key: 'price', header: 'سعر الفرد', width: 14 },
  { key: 'required', header: 'المطلوب', width: 16 },
  { key: 'paid', header: 'المدفوع', width: 16 },
  { key: 'status', header: 'الحالة', width: 10 },
];

const STATEMENT_PDF_WIDTHS: Record<string, number> = {
  description: 260,
  date: 90,
  count: 70,
  price: 90,
  required: 100,
  paid: 100,
  status: 52,
};

const loadStatement = async (req: Request) => {
  const { delegateId } = getParams<StatementParams>(req);
  return accountService.getDelegateAccountStatement(delegateId, {
    includeAdjustments: getActor(req).role === 'MANAGER',
  });
};

const statementRows = (
  statement: accountService.DelegateAccountStatement,
  money: (value: string) => string,
) => [
  ...statement.trips.map((t) => ({
    description: `رحلة: ${t.tripName}`,
    date: dateOnly(t.departureDate),
    count: t.activePilgrimCount,
    price: money(t.pricePerPerson),
    required: money(t.requiredAmount),
    paid: '',
    status: '',
  })),
  ...statement.payments.map((p) => ({
    description: `دفعة — إيصال رقم ${p.receiptNumber ?? p.legacyReceiptNumber ?? '-'} (${methodLabel(p.paymentMethod)}${p.transferType ? ` / ${transferLabel(p.transferType)}` : ''})`,
    date: dateOnly(p.paymentDate),
    count: '',
    price: '',
    required: '',
    paid: money(p.amount),
    status: p.status === 'VOIDED' ? 'ملغاة' : 'مسجلة',
  })),
  // Employees do not receive adjustment details; net lines keep the rows
  // reconciling with the totals (same figures as the account page).
  ...(statement.adjustments === null ? employeeAdjustmentRows(statement.summary, money) : []),
  ...(statement.adjustments ?? []).map((a) => ({
    description: `${a.type === 'REFUND' ? 'استرداد للمندوب' : 'تسوية إدارية'} — ${a.reason}`,
    date: dateOnly(a.effectiveDate),
    count: '',
    price: '',
    required: a.type === 'CORRECTION' ? `${a.effect === 'INCREASE' ? '+' : '-'}${money(a.amount)}` : '',
    paid: a.type === 'REFUND' ? `-${money(a.amount)}` : '',
    status: '',
  })),
];

const employeeAdjustmentRows = (
  summary: accountService.DelegateAccountSummary,
  money: (value: string) => string,
) => {
  const blank = { date: '', count: '', price: '', status: '' };
  const rows = [];
  if (Number(summary.correctionsNet) !== 0) {
    const net = summary.correctionsNet.startsWith('-') ? summary.correctionsNet.slice(1) : summary.correctionsNet;
    rows.push({ ...blank, description: 'تسويات إدارية (صافي)', required: `${summary.correctionsNet.startsWith('-') ? '-' : '+'}${money(net)}`, paid: '' });
  }
  if (Number(summary.refundsTotal) !== 0) {
    rows.push({ ...blank, description: 'استردادات للمندوب (إجمالي)', required: '', paid: `-${money(summary.refundsTotal)}` });
  }
  return rows;
};

/** Same three lines as the account page: required, paid, then one balance state. */
const statementSummary = (summary: accountService.DelegateAccountSummary, money: (v: string) => string) => [
  { label: 'إجمالي المطلوب', value: money(summary.totalRequired) },
  { label: 'إجمالي المدفوع', value: money(summary.totalPaid) },
  summary.status === 'CREDIT'
    ? { label: 'له رصيد', value: money(summary.credit) }
    : summary.status === 'SETTLED'
      ? { label: 'الحالة', value: 'مسدد بالكامل' }
      : { label: 'المتبقي عليه', value: money(summary.remaining) },
];

export const statementJson = async (req: Request, res: Response): Promise<void> => {
  ok(res, await loadStatement(req));
};

export const statementPdf = async (req: Request, res: Response): Promise<void> => {
  const statement = await loadStatement(req);
  const buffer = await renderStatementPdf({
    delegate: statement.delegate,
    statusLabel: accountStatusLabel(statement.summary.status),
    // Absolute point widths filling the A4 landscape content area (~762pt).
    columns: statementColumns.map((c) => ({
      key: c.key,
      header: c.header,
      width: STATEMENT_PDF_WIDTHS[c.key] ?? 80,
    })),
    rows: statementRows(statement, formatMoney).map((r) => ({
      ...r,
      date: r.date ? formatArabicDate(r.date) : '',
    })),
    summary: statementSummary(statement.summary, formatMoney),
  });
  sendPdf(res, buffer, `delegate-account-${statement.delegate.name}.pdf`);
};

export const statementExcel = async (req: Request, res: Response): Promise<void> => {
  const statement = await loadStatement(req);
  const buffer = await buildExcelBuffer({
    sheetName: 'حساب المندوب',
    title: `حساب المندوب — ${statement.delegate.name}`,
    columns: statementColumns,
    rows: statementRows(statement, (v) => v),
    summary: statementSummary(statement.summary, (v) => v),
  });
  sendExcel(res, buffer, `delegate-account-${statement.delegate.name}.xlsx`);
};

// ---------------------------------------------------------------------------
// Payment history (سجل الدفعات)
// ---------------------------------------------------------------------------

const paymentColumns: ExcelColumn[] = [
  { key: 'receiptNumber', header: 'رقم الإيصال الورقي', width: 18 },
  { key: 'delegateName', header: 'المندوب', width: 24 },
  { key: 'amount', header: 'المبلغ', width: 14 },
  { key: 'paymentMethod', header: 'طريقة الدفع', width: 12 },
  { key: 'transferType', header: 'نوع التحويل', width: 14 },
  { key: 'referenceNumber', header: 'رقم المرجع', width: 18 },
  { key: 'paymentDate', header: 'تاريخ الدفعة', width: 14 },
  { key: 'status', header: 'الحالة', width: 10 },
  { key: 'createdBy', header: 'الموظف', width: 20 },
];

export const paymentsJson = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<PaymentHistoryQuery>(req);
  ok(res, await reportService.paymentHistoryReport(query));
};

export const paymentsExcel = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<PaymentHistoryQuery>(req);
  const report = await reportService.paymentHistoryReport(query);
  const buffer = await buildExcelBuffer({
    sheetName: 'الدفعات',
    title: report.meta.title,
    columns: paymentColumns,
    rows: report.rows.map((row) => ({
      ...row,
      paymentMethod: methodLabel(row.paymentMethod),
      transferType: transferLabel(row.transferType),
      status: statusLabel(row.status),
    })),
    summary: [{ label: 'إجمالي الدفعات السارية', value: report.summary.totalActive }],
  });
  sendExcel(res, buffer, 'payments.xlsx');
};

export const paymentsPdf = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<PaymentHistoryQuery>(req);
  const report = await reportService.paymentHistoryReport(query);
  const buffer = await renderTablePdf({
    title: report.meta.title,
    columns: paymentColumns.map((c) => ({ key: c.key, header: c.header, width: c.width * 1.25 })),
    rows: report.rows.map((row) => ({
      ...row,
      paymentMethod: methodLabel(row.paymentMethod),
      transferType: transferLabel(row.transferType) || '-',
      status: statusLabel(row.status),
      amount: formatMoney(row.amount),
    })),
    landscape: true,
    summary: [{ label: 'إجمالي الدفعات السارية', value: formatMoney(report.summary.totalActive) }],
  });
  sendPdf(res, buffer, 'payments.pdf');
};

export const dashboardStats = async (_req: Request, res: Response): Promise<void> => {
  ok(res, await reportService.dashboardStats());
};
