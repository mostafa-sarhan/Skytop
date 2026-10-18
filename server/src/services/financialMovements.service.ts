import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { dateRangeFilter } from '../utils/dateRange';
import { decimalToJson } from '../utils/money';
import { buildPage } from '../utils/pagination';
import { adjustmentEffect } from './delegateAccount.service';

/**
 * سجل الحركات المالية (manager only). Nothing is stored for this view: it is
 * read from the records that already define the account —
 *   PAYMENT      every recorded payment (active or later voided)
 *   PAYMENT_VOID a voided payment, dated when it was voided
 *   REFUND / CORRECTION  FinancialAdjustment rows
 * `effect` tells whether the movement increases or decreases what the
 * delegate still owes.
 */

export type MovementKind = 'PAYMENT' | 'PAYMENT_VOID' | 'REFUND' | 'CORRECTION';

export interface MovementQuery {
  page: number;
  pageSize: number;
  delegateId?: string;
  kind?: MovementKind;
  from?: Date;
  to?: Date;
}

export interface FinancialMovement {
  id: string;
  kind: MovementKind;
  date: string;
  recordedAt: string;
  delegate: { id: string; name: string };
  amount: string;
  effect: 'INCREASE' | 'DECREASE';
  receiptNumber: string | null;
  reason: string | null;
  paymentId: string | null;
  performedBy: { id: string; fullName: string } | null;
}

const byNewest = (a: FinancialMovement, b: FinancialMovement) =>
  b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt);

export const listFinancialMovements = async (query: MovementQuery) => {
  const range = dateRangeFilter(query.from, query.to);
  const wants = (kind: MovementKind) => !query.kind || query.kind === kind;
  const delegateFilter = query.delegateId ? { delegateId: query.delegateId } : {};

  const paymentWhere: Prisma.PaymentWhereInput = { ...delegateFilter, ...(range ? { paymentDate: range } : {}) };
  const voidWhere: Prisma.PaymentWhereInput = {
    ...delegateFilter,
    status: 'VOIDED',
    ...(range ? { voidedAt: range } : {}),
  };
  const adjustmentWhere: Prisma.FinancialAdjustmentWhereInput = {
    ...delegateFilter,
    ...(query.kind === 'REFUND' || query.kind === 'CORRECTION' ? { type: query.kind } : {}),
    ...(range ? { effectiveDate: range } : {}),
  };

  // Top-N merge: the newest page*pageSize of each source are enough to build
  // the requested page of the combined, date-ordered list.
  const take = query.page * query.pageSize;
  const delegate = { select: { id: true, name: true } } as const;
  const user = { select: { id: true, fullName: true } } as const;

  const [payments, voids, adjustments, paymentCount, voidCount, adjustmentCount] = await Promise.all([
    wants('PAYMENT')
      ? prisma.payment.findMany({
          where: paymentWhere,
          include: { delegate, createdBy: user },
          orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
          take,
        })
      : [],
    wants('PAYMENT_VOID')
      ? prisma.payment.findMany({
          where: voidWhere,
          include: { delegate, voidedBy: user },
          orderBy: [{ voidedAt: 'desc' }],
          take,
        })
      : [],
    wants('REFUND') || wants('CORRECTION')
      ? prisma.financialAdjustment.findMany({
          where: adjustmentWhere,
          include: { delegate, performedBy: user, relatedPayment: { select: { receiptNumber: true } } },
          orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
          take,
        })
      : [],
    wants('PAYMENT') ? prisma.payment.count({ where: paymentWhere }) : 0,
    wants('PAYMENT_VOID') ? prisma.payment.count({ where: voidWhere }) : 0,
    wants('REFUND') || wants('CORRECTION') ? prisma.financialAdjustment.count({ where: adjustmentWhere }) : 0,
  ]);

  const rows: FinancialMovement[] = [
    ...payments.map((p) => ({
      id: `payment:${p.id}`,
      kind: 'PAYMENT' as const,
      date: p.paymentDate.toISOString(),
      recordedAt: p.createdAt.toISOString(),
      delegate: p.delegate,
      amount: decimalToJson(p.amount)!,
      effect: 'DECREASE' as const,
      receiptNumber: p.receiptNumber ?? p.legacyReceiptNumber,
      reason: null,
      paymentId: p.id,
      performedBy: p.createdBy,
    })),
    ...voids.map((p) => ({
      id: `void:${p.id}`,
      kind: 'PAYMENT_VOID' as const,
      date: (p.voidedAt ?? p.updatedAt).toISOString(),
      recordedAt: (p.voidedAt ?? p.updatedAt).toISOString(),
      delegate: p.delegate,
      amount: decimalToJson(p.amount)!,
      effect: 'INCREASE' as const,
      receiptNumber: p.receiptNumber ?? p.legacyReceiptNumber,
      reason: p.voidReason,
      paymentId: p.id,
      performedBy: p.voidedBy,
    })),
    ...adjustments.map((a) => ({
      id: `adjustment:${a.id}`,
      kind: a.type,
      date: a.effectiveDate.toISOString(),
      recordedAt: a.createdAt.toISOString(),
      delegate: a.delegate,
      amount: decimalToJson(a.amount)!,
      effect: adjustmentEffect(a),
      receiptNumber: a.relatedPayment?.receiptNumber ?? null,
      reason: a.reason,
      paymentId: a.relatedPaymentId,
      performedBy: a.performedBy,
    })),
  ].sort(byNewest);

  const start = (query.page - 1) * query.pageSize;
  return buildPage(
    rows.slice(start, start + query.pageSize),
    paymentCount + voidCount + adjustmentCount,
    query.page,
    query.pageSize,
  );
};
