import { Response } from 'express';
import { Request } from 'express';
import { getParams, getQuery } from '../middlewares/validate';
import * as reportService from '../services/report.service';
import * as accountService from '../services/delegateAccount.service';
import * as expenseService from '../services/expense.service';
import { getActor } from '../utils/actor';
import { ok } from '../utils/http';
import { buildExcelBuffer, ExcelColumn } from '../modules/excel/excel';
import { PdfRow, renderStatementPdf, renderTablePdf } from '../modules/pdf/reports.pdf';
import { COMPANY_NAME_AR } from '../config/app';
import { formatArabicDate, formatMoney } from '../modules/pdf/format';
import { contentDisposition } from '../utils/contentDisposition';
import {
  TripReportQuery,
  DelegateTripReportQuery,
  MissingDocumentsQuery,
  StatementParams,
  PaymentHistoryQuery,
  ExpenseReportQuery,
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

const methodLabel = (value: string): string => (value === 'CASH' ? 'نقداً' : 'تحويل');
const transferLabel = (value?: string | null): string =>
  value === 'INSTAPAY' ? 'انستاباي' : value === 'BANK_TRANSFER' ? 'تحويل بنكي' : '';
/** Same wording as the payments page. */
const paymentStatusLabel = (value: string): string => (value === 'VOIDED' ? 'ملغاة' : 'مسجلة');
const tripStatusLabel = (value: string): string =>
  value === 'OPEN' ? 'مفتوحة' : value === 'CLOSED' ? 'مغلقة' : 'مكتملة';

const dateOnly = (value?: string | Date | null): string =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

/** File-name safe text (names may contain slashes etc.). */
const fileSafe = (value: string): string => value.replace(/[\\/:*?"<>|]+/g, '-').trim();

// ---------------------------------------------------------------------------
// Passenger lists (كشف المعتمرين) — trip, and delegate inside a trip
// ---------------------------------------------------------------------------

/**
 * The official list columns: م، الاسم، المهنة، العنوان, then the optional
 * passport / national ID columns. Widths are Excel character widths and the
 * PDF uses them as relative weights.
 */
const passengerColumns = (options: { passport: boolean; nationalId: boolean; delegate?: boolean }): ExcelColumn[] => [
  { key: 'index', header: 'م', width: 5, align: 'center' },
  { key: 'name', header: 'الاسم', width: 28 },
  { key: 'job', header: 'المهنة', width: 15 },
  { key: 'address', header: 'العنوان', width: 34 },
  ...(options.passport ? [{ key: 'passportNumber', header: 'رقم جواز السفر', width: 15, align: 'center' as const }] : []),
  ...(options.nationalId ? [{ key: 'nationalId', header: 'الرقم القومي', width: 17, align: 'center' as const }] : []),
  ...(options.delegate ? [{ key: 'delegateName', header: 'المندوب', width: 22 }] : []),
];

const pdfColumns = (columns: ExcelColumn[]) =>
  columns.map((c) => ({ key: c.key, header: c.header, width: c.width, align: c.align }));

const passengerCells = (row: Record<string, string | number>) => ({
  ...row,
  job: row.job || '—',
  address: row.address || '—',
  nationalId: row.nationalId || '—',
});

export const tripPilgrimsJson = async (req: Request, res: Response): Promise<void> => {
  const { tripId } = getQuery<TripReportQuery>(req);
  ok(res, await reportService.tripPilgrimsReport(tripId));
};

const tripContext = (report: Awaited<ReturnType<typeof reportService.tripPilgrimsReport>>) => [
  { label: 'الرحلة', value: report.trip.name },
  { label: 'حالة الرحلة', value: tripStatusLabel(report.trip.status) },
  { label: 'تاريخ السفر', value: formatArabicDate(report.trip.departureDate) },
  { label: 'تاريخ العودة', value: formatArabicDate(report.trip.returnDate) },
  { label: 'عدد المعتمرين', value: String(report.summary.total) },
  { label: 'عدد المناديب', value: String(report.summary.delegates) },
];

export const tripPilgrimsExcel = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<TripReportQuery>(req);
  const report = await reportService.tripPilgrimsReport(query.tripId);
  const buffer = await buildExcelBuffer({
    sheetName: 'كشف الرحلة',
    title: `${COMPANY_NAME_AR} — ${report.meta.title}`,
    context: tripContext(report),
    // Excel keeps a delegate column so the sheet can be filtered / sorted.
    columns: passengerColumns({ ...query, delegate: true }),
    rows: report.rows.map(passengerCells),
  });
  sendExcel(res, buffer, `trip-pilgrims-${fileSafe(report.trip.name)}.xlsx`);
};

export const tripPilgrimsPdf = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<TripReportQuery>(req);
  const report = await reportService.tripPilgrimsReport(query.tripId);
  // Grouped by delegate: a section bar before each delegate's pilgrims.
  const rows: PdfRow[] = [];
  let current = '';
  for (const row of report.rows) {
    if (row.delegateName !== current) {
      current = row.delegateName;
      const count = report.groups.find((g) => g.delegateName === current)?.count ?? 0;
      rows.push({ __group: `المندوب: ${current} — ${count} معتمر` });
    }
    rows.push(passengerCells(row));
  }
  const buffer = await renderTablePdf({
    title: report.meta.title,
    subtitle: report.trip.name,
    context: tripContext(report),
    columns: pdfColumns(passengerColumns(query)),
    rows,
  });
  sendPdf(res, buffer, `trip-pilgrims-${fileSafe(report.trip.name)}.pdf`);
};

export const delegateTripPilgrimsJson = async (req: Request, res: Response): Promise<void> => {
  const { delegateId, tripId } = getQuery<DelegateTripReportQuery>(req);
  ok(res, await reportService.delegateTripPilgrimsReport(delegateId, tripId));
};

const delegateTripContext = (report: Awaited<ReturnType<typeof reportService.delegateTripPilgrimsReport>>) => [
  { label: 'الرحلة', value: report.trip.name },
  { label: 'المندوب', value: report.delegate.name },
  { label: 'تاريخ السفر', value: formatArabicDate(report.trip.departureDate) },
  { label: 'تاريخ العودة', value: formatArabicDate(report.trip.returnDate) },
  { label: 'عدد المعتمرين', value: String(report.summary.total) },
  { label: 'هاتف المندوب', value: report.delegate.phone },
];

export const delegateTripPilgrimsExcel = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<DelegateTripReportQuery>(req);
  const report = await reportService.delegateTripPilgrimsReport(query.delegateId, query.tripId);
  const buffer = await buildExcelBuffer({
    sheetName: 'كشف المعتمرين',
    title: `${COMPANY_NAME_AR} — ${report.meta.title}`,
    context: delegateTripContext(report),
    columns: passengerColumns(query),
    rows: report.rows.map(passengerCells),
  });
  sendExcel(res, buffer, `pilgrims-${fileSafe(report.delegate.name)}-${fileSafe(report.trip.name)}.xlsx`);
};

export const delegateTripPilgrimsPdf = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<DelegateTripReportQuery>(req);
  const report = await reportService.delegateTripPilgrimsReport(query.delegateId, query.tripId);
  const buffer = await renderTablePdf({
    title: report.meta.title,
    subtitle: `${report.delegate.name} — ${report.trip.name}`,
    context: delegateTripContext(report),
    columns: pdfColumns(passengerColumns(query)),
    rows: report.rows.map(passengerCells),
  });
  sendPdf(res, buffer, `pilgrims-${fileSafe(report.delegate.name)}-${fileSafe(report.trip.name)}.pdf`);
};

// ---------------------------------------------------------------------------
// كشف النواقص (missing documents)
// ---------------------------------------------------------------------------

export const missingDocumentsJson = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<MissingDocumentsQuery>(req);
  ok(res, await reportService.missingDocumentsReport(query));
};

const missingDocColumns: ExcelColumn[] = [
  { key: 'index', header: 'م', width: 5, align: 'center' },
  { key: 'name', header: 'الاسم', width: 28 },
  { key: 'passportNumber', header: 'رقم جواز السفر', width: 15, align: 'center' },
  { key: 'tripName', header: 'الرحلة', width: 22 },
  { key: 'delegateName', header: 'المندوب', width: 22 },
  { key: 'missing', header: 'المستندات الناقصة', width: 32 },
];

const missingText = (row: { hasPassportImage: boolean; hasPersonalPhoto: boolean }): string =>
  [!row.hasPassportImage ? 'صورة جواز السفر' : '', !row.hasPersonalPhoto ? 'الصورة الشخصية' : '']
    .filter(Boolean)
    .join('، ');

const missingContext = (report: Awaited<ReturnType<typeof reportService.missingDocumentsReport>>) => [
  { label: 'الرحلة', value: report.meta.filters.trip ?? 'كل الرحلات' },
  { label: 'المندوب', value: report.meta.filters.delegate ?? 'كل المناديب' },
  { label: 'ملفات ناقصة', value: `${report.summary.incomplete} من ${report.summary.total} معتمر` },
  { label: 'ناقص صورة الجواز', value: String(report.summary.missingPassport) },
  { label: 'ناقص الصورة الشخصية', value: String(report.summary.missingPhoto) },
];

const missingRows = (report: Awaited<ReturnType<typeof reportService.missingDocumentsReport>>) =>
  report.rows.map((row) => ({
    index: row.index,
    name: row.name,
    passportNumber: row.passportNumber,
    tripName: row.tripName,
    delegateName: row.delegateName,
    missing: missingText(row),
  }));

export const missingDocumentsExcel = async (req: Request, res: Response): Promise<void> => {
  const report = await reportService.missingDocumentsReport(getQuery<MissingDocumentsQuery>(req));
  const buffer = await buildExcelBuffer({
    sheetName: 'كشف النواقص',
    title: `${COMPANY_NAME_AR} — ${report.meta.title}`,
    context: missingContext(report),
    columns: missingDocColumns,
    rows: missingRows(report),
  });
  sendExcel(res, buffer, 'missing-documents.xlsx');
};

export const missingDocumentsPdf = async (req: Request, res: Response): Promise<void> => {
  const report = await reportService.missingDocumentsReport(getQuery<MissingDocumentsQuery>(req));
  const buffer = await renderTablePdf({
    title: report.meta.title,
    context: missingContext(report),
    columns: pdfColumns(missingDocColumns),
    rows: missingRows(report),
    landscape: true,
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
  { key: 'index', header: 'م', width: 5, align: 'center' },
  { key: 'receiptNumber', header: 'رقم الإيصال الورقي', width: 18 },
  { key: 'delegateName', header: 'المندوب', width: 24 },
  { key: 'amount', header: 'المبلغ', width: 14, money: true },
  { key: 'paymentMethod', header: 'طريقة الدفع', width: 12 },
  { key: 'transferType', header: 'نوع التحويل', width: 14 },
  { key: 'referenceNumber', header: 'رقم المرجع', width: 18 },
  { key: 'paymentDate', header: 'تاريخ الدفعة', width: 14 },
  { key: 'status', header: 'الحالة', width: 10 },
  { key: 'createdBy', header: 'سجّلها', width: 20 },
];

const paymentContext = (report: Awaited<ReturnType<typeof reportService.paymentHistoryReport>>) => [
  { label: 'المندوب', value: report.meta.filters.delegate ?? 'كل المناديب' },
  {
    label: 'الفترة',
    value:
      report.meta.filters.from || report.meta.filters.to
        ? `${report.meta.filters.from ? formatArabicDate(report.meta.filters.from) : '…'} — ${report.meta.filters.to ? formatArabicDate(report.meta.filters.to) : '…'}`
        : 'كل الفترات',
  },
];

const paymentLabels = (row: Awaited<ReturnType<typeof reportService.paymentHistoryReport>>['rows'][number]) => ({
  ...row,
  paymentMethod: methodLabel(row.paymentMethod),
  transferType: transferLabel(row.transferType) || '—',
  referenceNumber: row.referenceNumber || '—',
  status: paymentStatusLabel(row.status),
});

export const paymentsJson = async (req: Request, res: Response): Promise<void> => {
  ok(res, await reportService.paymentHistoryReport(getQuery<PaymentHistoryQuery>(req)));
};

export const paymentsExcel = async (req: Request, res: Response): Promise<void> => {
  const report = await reportService.paymentHistoryReport(getQuery<PaymentHistoryQuery>(req));
  const buffer = await buildExcelBuffer({
    sheetName: 'الدفعات',
    title: `${COMPANY_NAME_AR} — ${report.meta.title}`,
    context: paymentContext(report),
    columns: paymentColumns,
    rows: report.rows.map((row) => ({ ...paymentLabels(row), amount: Number(row.amount) })),
    summary: [
      { label: 'عدد الدفعات المسجلة', value: report.summary.activeCount },
      { label: 'إجمالي الدفعات المسجلة (بدون الملغاة)', value: report.summary.totalActive },
    ],
  });
  sendExcel(res, buffer, 'payments.xlsx');
};

export const paymentsPdf = async (req: Request, res: Response): Promise<void> => {
  const report = await reportService.paymentHistoryReport(getQuery<PaymentHistoryQuery>(req));
  const buffer = await renderTablePdf({
    title: report.meta.title,
    context: paymentContext(report),
    columns: pdfColumns(paymentColumns),
    rows: report.rows.map((row) => ({ ...paymentLabels(row), amount: formatMoney(row.amount), paymentDate: formatArabicDate(row.paymentDate) })),
    landscape: true,
    summary: [
      { label: 'عدد الدفعات المسجلة', value: String(report.summary.activeCount) },
      { label: 'إجمالي الدفعات المسجلة (بدون الملغاة)', value: `${formatMoney(report.summary.totalActive)} جنيه` },
    ],
  });
  sendPdf(res, buffer, 'payments.pdf');
};

// ---------------------------------------------------------------------------
// Company expenses (المصروفات) — separate from delegate accounts
// ---------------------------------------------------------------------------

const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  ELECTRICITY: 'كهرباء',
  INTERNET: 'إنترنت',
  RENT: 'إيجار',
  OFFICE_SUPPLIES: 'أدوات مكتبية',
  MAINTENANCE: 'صيانة',
  TRANSPORTATION: 'نقل',
  HOSPITALITY: 'ضيافة',
  OTHER: 'أخرى',
};
const expenseStatusLabel = (value: string): string => (value === 'VOIDED' ? 'ملغى' : 'مسجل');

const expenseColumns = (includeVoided: boolean): ExcelColumn[] => [
  { key: 'index', header: 'م', width: 5, align: 'center' },
  { key: 'expenseDate', header: 'التاريخ', width: 14 },
  { key: 'category', header: 'التصنيف', width: 14 },
  { key: 'description', header: 'البيان', width: 36 },
  { key: 'amount', header: 'المبلغ', width: 14, money: true },
  { key: 'paymentMethod', header: 'طريقة الدفع', width: 18 },
  { key: 'referenceNumber', header: 'الرقم المرجعي', width: 16 },
  { key: 'createdBy', header: 'سجّله', width: 18 },
  ...(includeVoided ? [{ key: 'status', header: 'الحالة', width: 10 }] : []),
];

const loadExpenseReport = async (req: Request) => {
  const query = getQuery<ExpenseReportQuery>(req);
  return { query, report: await expenseService.expenseReport(query) };
};

const expenseContext = (query: ExpenseReportQuery) => [
  { label: 'التصنيف', value: query.category ? EXPENSE_CATEGORY_LABEL[query.category]! : 'كل التصنيفات' },
  { label: 'طريقة الدفع', value: query.paymentMethod ? methodLabel(query.paymentMethod) : 'الكل' },
  {
    label: 'الفترة',
    value:
      query.from || query.to
        ? `${query.from ? formatArabicDate(query.from) : '…'} — ${query.to ? formatArabicDate(query.to) : '…'}`
        : 'كل الفترات',
  },
  { label: 'المصروفات الملغاة', value: query.includeVoided ? 'ظاهرة ومعلَّمة (لا تدخل في الإجمالي)' : 'غير ظاهرة' },
];

const expenseLabels = (row: Awaited<ReturnType<typeof expenseService.expenseReport>>['rows'][number]) => ({
  ...row,
  category: EXPENSE_CATEGORY_LABEL[row.category] ?? row.category,
  paymentMethod: `${methodLabel(row.paymentMethod)}${row.transferType ? ` — ${transferLabel(row.transferType)}` : ''}`,
  transferType: transferLabel(row.transferType),
  referenceNumber: row.referenceNumber || '—',
  status: expenseStatusLabel(row.status),
});

const expenseSummaryLines = (summary: { activeCount: number; activeTotal: string }, money: (v: string) => string) => [
  { label: 'عدد المصروفات (بدون الملغاة)', value: String(summary.activeCount) },
  { label: 'إجمالي المصروفات (بدون الملغاة)', value: money(summary.activeTotal) },
];

export const expensesExcel = async (req: Request, res: Response): Promise<void> => {
  const { query, report } = await loadExpenseReport(req);
  const buffer = await buildExcelBuffer({
    sheetName: 'المصروفات',
    title: `${COMPANY_NAME_AR} — كشف المصروفات`,
    context: expenseContext(query),
    columns: expenseColumns(query.includeVoided),
    rows: report.rows.map((row) => ({ ...expenseLabels(row), amount: Number(row.amount) })),
    summary: expenseSummaryLines(report.summary, (v) => v),
  });
  sendExcel(res, buffer, 'expenses.xlsx');
};

export const expensesPdf = async (req: Request, res: Response): Promise<void> => {
  const { query, report } = await loadExpenseReport(req);
  const buffer = await renderTablePdf({
    title: 'كشف المصروفات',
    context: expenseContext(query),
    columns: pdfColumns(expenseColumns(query.includeVoided)),
    rows: report.rows.map((row) => ({
      ...expenseLabels(row),
      amount: formatMoney(row.amount),
      expenseDate: formatArabicDate(row.expenseDate),
    })),
    landscape: true,
    summary: expenseSummaryLines(report.summary, (v) => `${formatMoney(v)} جنيه`),
  });
  sendPdf(res, buffer, 'expenses.pdf');
};

