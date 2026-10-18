import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { dateRangeFilter } from '../utils/dateRange';
import { AppError } from '../utils/AppError';
import { decimalToJson } from '../utils/money';
import { buildPage } from '../utils/pagination';
import { TransactionClient, withTransaction } from '../utils/transaction';
import { receiptKey } from '../utils/receiptNumber';
import { writeAuditLog } from '../utils/audit';
import {
  removeQuietly,
  resolveStoredFile,
  storePrivateFile,
  UploadedFile,
} from '../modules/documents/storage';
import { getDelegateAccount, serializePaymentRow } from './delegateAccount.service';

export interface PaymentActor {
  id: string;
  role: string;
  fullName: string;
}

export interface CreatePaymentInput {
  delegateId: string;
  amount: string;
  /** Already normalized by the validator (see normalizeReceiptNumber). */
  receiptNumber: string;
  paymentMethod: 'CASH' | 'TRANSFER';
  transferType?: 'INSTAPAY' | 'BANK_TRANSFER';
  referenceNumber?: string;
  paymentDate: Date;
  notes?: string;
}

const RECEIPT_SCAN_FOLDER = 'payments';

const duplicateReceiptError = (existing: {
  receiptNumber: string | null;
  paymentDate: Date;
  status: 'ACTIVE' | 'VOIDED';
  delegate: { name: string };
}) =>
  AppError.conflict(
    `رقم الإيصال ${existing.receiptNumber} مسجّل من قبل في دفعة ${existing.status === 'VOIDED' ? 'ملغاة' : 'سارية'} للمندوب "${existing.delegate.name}" بتاريخ ${existing.paymentDate.toISOString().slice(0, 10)}، ورقم الإيصال لا يمكن استخدامه مرة أخرى. استخدم إيصالاً ورقياً جديداً.`,
    { field: 'receiptNumber' },
  );

const existingReceiptSelect = {
  receiptNumber: true,
  paymentDate: true,
  status: true,
  delegate: { select: { name: true } },
} satisfies Prisma.PaymentSelect;

const isUniqueViolationOn = (error: unknown, column: string): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002' &&
  JSON.stringify(error.meta?.target ?? '').includes(column);

/**
 * Records a payment the delegate already handed over against a physical paper
 * receipt. The receipt number comes from the paper receipt and the scan is
 * mandatory. Once created the payment is immutable for employees.
 */
export const createPayment = async (
  actor: PaymentActor,
  input: CreatePaymentInput,
  receiptScan: UploadedFile | undefined,
) => {
  if (!receiptScan) {
    throw AppError.badRequest('يجب إرفاق صورة أو مسح ضوئي للإيصال الورقي', { field: 'receiptScan' });
  }
  const delegate = await prisma.delegate.findUnique({ where: { id: input.delegateId } });
  if (!delegate) throw AppError.notFound('المندوب غير موجود');
  if (input.paymentMethod === 'TRANSFER' && !input.transferType) {
    throw AppError.badRequest('يجب تحديد نوع التحويل لطريقة الدفع بالتحويل');
  }
  if (input.paymentMethod === 'CASH') {
    input.transferType = undefined;
    input.referenceNumber = undefined;
  }

  const key = receiptKey(input.receiptNumber);
  // Receipt numbers are reserved forever: voided payments still hold theirs.
  const existing = await prisma.payment.findUnique({
    where: { receiptKey: key },
    select: existingReceiptSelect,
  });
  if (existing) throw duplicateReceiptError(existing);

  const paymentId = crypto.randomUUID();
  const scanKey = await storePrivateFile(RECEIPT_SCAN_FOLDER, paymentId, 'RECEIPT_SCAN', receiptScan);

  try {
    return await withTransaction(async (tx) => {
      const payment = await tx.payment.create({
        include: {
          createdBy: { select: { id: true, fullName: true } },
          delegate: { select: { id: true, name: true, phone: true } },
        },
        data: {
          id: paymentId,
          delegateId: input.delegateId,
          amount: input.amount,
          receiptNumber: input.receiptNumber,
          receiptKey: key,
          receiptScanKey: scanKey,
          receiptScanMimeType: receiptScan.mimetype,
          receiptScanOriginalName: receiptScan.originalname.slice(0, 255),
          receiptScanSizeBytes: receiptScan.size,
          paymentMethod: input.paymentMethod,
          transferType: input.transferType,
          referenceNumber: input.referenceNumber,
          paymentDate: input.paymentDate,
          notes: input.notes,
          createdById: actor.id,
        },
      });

      return serializePaymentRow(payment);
    });
  } catch (error) {
    await removeQuietly(scanKey);
    if (isUniqueViolationOn(error, 'receiptKey')) {
      const clash = await prisma.payment.findUnique({
        where: { receiptKey: key },
        select: existingReceiptSelect,
      });
      if (clash) throw duplicateReceiptError(clash);
    }
    throw error;
  }
};

export interface PaymentListQuery {
  page: number;
  pageSize: number;
  search?: string;
  delegateId?: string;
  status?: 'ACTIVE' | 'VOIDED';
  from?: Date;
  to?: Date;
}

const paymentInclude = {
  delegate: { select: { id: true, name: true, phone: true } },
  createdBy: { select: { id: true, fullName: true } },
  voidedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PaymentInclude;

export const listPayments = async (query: PaymentListQuery) => {
  const where: Prisma.PaymentWhereInput = {
    ...(query.delegateId ? { delegateId: query.delegateId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { receiptNumber: { contains: query.search, mode: 'insensitive' } },
            { legacyReceiptNumber: { contains: query.search, mode: 'insensitive' } },
            { delegate: { name: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(query.from || query.to ? { paymentDate: dateRangeFilter(query.from, query.to) } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.payment.count({ where }),
  ]);

  return buildPage(rows.map(serializePaymentRow), total, query.page, query.pageSize);
};

export const getPaymentById = async (paymentId: string) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: paymentInclude,
  });
  if (!payment) throw AppError.notFound('الدفعة غير موجودة');
  return serializePaymentRow(payment);
};

/** Authenticated access to the stored receipt scan of a payment. */
export const getPaymentReceiptScan = async (paymentId: string) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      receiptNumber: true,
      receiptScanKey: true,
      receiptScanMimeType: true,
      receiptScanOriginalName: true,
      receiptScanSizeBytes: true,
    },
  });
  if (!payment) throw AppError.notFound('الدفعة غير موجودة');
  if (!payment.receiptScanKey) throw AppError.notFound('لا توجد صورة إيصال مرفقة بهذه الدفعة');

  return {
    absolutePath: await resolveStoredFile(payment.receiptScanKey),
    mime: payment.receiptScanMimeType ?? 'application/octet-stream',
    originalName: payment.receiptScanOriginalName ?? `receipt-${payment.receiptNumber ?? paymentId}`,
    size: payment.receiptScanSizeBytes ?? undefined,
  };
};

/**
 * Manager-only. Financial history is never hard-deleted: the payment stays in
 * place with status VOIDED (and who/when/why), which alone removes it from the
 * delegate's total paid — no reversing record is needed. Its paper receipt
 * number stays permanently reserved; a replacement payment must use a new
 * physical receipt.
 */
export const voidPayment = async (actor: PaymentActor, paymentId: string, reason: string) => {
  if (actor.role !== 'MANAGER') throw AppError.forbidden();

  return withTransaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw AppError.notFound('الدفعة غير موجودة');
    await lockDelegateAccount(tx, payment.delegateId);

    // Conditional flip first so two concurrent voids cannot both reverse it.
    const flipped = await tx.payment.updateMany({
      where: { id: paymentId, status: 'ACTIVE' },
      data: {
        status: 'VOIDED',
        voidedById: actor.id,
        voidedAt: new Date(),
        voidReason: reason,
      },
    });
    if (flipped.count === 0) throw AppError.badRequest('الدفعة ملغاة مسبقاً');

    await writeAuditLog(
      {
        userId: actor.id,
        action: 'PAYMENT_VOID',
        entityType: 'Payment',
        entityId: payment.id,
        oldData: {
          status: payment.status,
          amount: payment.amount,
          receiptNumber: payment.receiptNumber ?? payment.legacyReceiptNumber,
          delegateId: payment.delegateId,
        },
        newData: { status: 'VOIDED', reason },
      },
      tx,
    );

    const updatedPayment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: paymentInclude,
    });
    return serializePaymentRow(updatedPayment);
  });
};

/**
 * Serialises money-changing manager actions per delegate (refund credit check,
 * void) by locking the delegate row for the rest of the transaction.
 */
const lockDelegateAccount = async (tx: TransactionClient, delegateId: string) => {
  await tx.$queryRaw`SELECT 1 FROM "Delegate" WHERE "id" = ${delegateId}::uuid FOR UPDATE`;
};

export type AdjustmentDirection = 'INCREASE' | 'DECREASE';

const serializeAdjustment = (row: {
  id: string;
  type: 'REFUND' | 'CORRECTION';
  direction: AdjustmentDirection | null;
  delegateId: string;
  amount: Prisma.Decimal;
  reason: string;
  effectiveDate: Date;
  relatedPaymentId: string | null;
  performedById: string;
  createdAt: Date;
}) => ({
  ...row,
  amount: decimalToJson(row.amount)!,
  effectiveDate: row.effectiveDate.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

/**
 * Writes one explicit manager adjustment (the only record that affects the
 * account) plus its audit entry, and returns the recalculated account.
 */
const recordAdjustment = async (
  actor: PaymentActor,
  input: {
    type: 'REFUND' | 'CORRECTION';
    direction?: AdjustmentDirection;
    delegateId: string;
    amount: string;
    reason: string;
    effectiveDate: Date;
    relatedPaymentId?: string;
  },
  check?: (tx: TransactionClient) => Promise<void>,
) => {
  if (actor.role !== 'MANAGER') throw AppError.forbidden();
  const delegate = await prisma.delegate.findUnique({ where: { id: input.delegateId } });
  if (!delegate) throw AppError.notFound('المندوب غير موجود');
  if (input.relatedPaymentId) {
    const payment = await prisma.payment.findFirst({
      where: { id: input.relatedPaymentId, delegateId: input.delegateId },
    });
    if (!payment) throw AppError.badRequest('الدفعة المرتبطة غير تابعة لهذا المندوب');
  }

  return withTransaction(async (tx) => {
    await lockDelegateAccount(tx, input.delegateId);
    if (check) await check(tx);

    const adjustment = await tx.financialAdjustment.create({
      data: {
        type: input.type,
        direction: input.type === 'CORRECTION' ? input.direction : null,
        delegateId: input.delegateId,
        amount: input.amount,
        reason: input.reason,
        effectiveDate: input.effectiveDate,
        relatedPaymentId: input.relatedPaymentId,
        performedById: actor.id,
      },
    });

    await writeAuditLog(
      {
        userId: actor.id,
        action: input.type === 'REFUND' ? 'REFUND' : 'FINANCIAL_CORRECTION',
        entityType: 'FinancialAdjustment',
        entityId: adjustment.id,
        newData: {
          delegateId: input.delegateId,
          delegateName: delegate.name,
          amount: input.amount,
          direction: adjustment.direction,
          reason: input.reason,
          relatedPaymentId: input.relatedPaymentId ?? null,
        },
      },
      tx,
    );

    return {
      adjustment: serializeAdjustment(adjustment),
      account: await getDelegateAccount(input.delegateId, tx),
    };
  });
};

/**
 * Manager-only refund (استرداد): money returned to the delegate. Reduces the
 * delegate's total paid, so it is limited to the current credit (له رصيد).
 */
export const createRefund = (
  actor: PaymentActor,
  input: { delegateId: string; amount: string; reason: string; relatedPaymentId?: string; refundDate: Date },
) =>
  recordAdjustment(
    actor,
    {
      type: 'REFUND',
      delegateId: input.delegateId,
      amount: input.amount,
      reason: input.reason,
      effectiveDate: input.refundDate,
      relatedPaymentId: input.relatedPaymentId,
    },
    async (tx) => {
      const account = await getDelegateAccount(input.delegateId, tx);
      const creditAvailable = new Prisma.Decimal(account.credit);
      if (creditAvailable.lessThan(input.amount)) {
        throw AppError.unprocessable(
          'لا يوجد رصيد كافٍ للمندوب لاسترداد هذا المبلغ، راجع حساب المندوب أولاً',
          { creditAvailable: decimalToJson(creditAvailable) },
        );
      }
    },
  );

/**
 * Manager-only correction (تسوية): INCREASE adds to what the delegate owes
 * (إضافة على الحساب), DECREASE deducts from it (خصم من الحساب).
 */
export const createCorrection = (
  actor: PaymentActor,
  input: {
    delegateId: string;
    amount: string;
    direction: AdjustmentDirection;
    reason: string;
    relatedPaymentId?: string;
  },
) =>
  recordAdjustment(actor, {
    type: 'CORRECTION',
    direction: input.direction,
    delegateId: input.delegateId,
    amount: input.amount,
    reason: input.reason,
    effectiveDate: new Date(),
    relatedPaymentId: input.relatedPaymentId,
  });
