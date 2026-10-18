import { Prisma, Role } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { decimalToJson } from '../utils/money';
import { buildPage } from '../utils/pagination';
import { TransactionClient } from '../utils/transaction';

/**
 * Delegate account model. The company deals financially with the delegate
 * only; pilgrims never carry an individual financial record.
 *
 *   tripsRequired  = Σ over DelegateTrip ( active pilgrims × pricePerPerson )
 *   totalRequired  = tripsRequired + manager corrections (signed)
 *   totalPaid      = Σ ACTIVE payments − Σ refunds
 *   remaining      = max(totalRequired − totalPaid, 0)   → "المتبقي عليه"
 *   credit         = max(totalPaid − totalRequired, 0)   → "له رصيد"
 *
 * Nothing here is cached: every figure is computed from its single source
 * (DelegateTrip + Pilgrim, Payment, and FinancialAdjustment).
 */

type Db = TransactionClient | typeof prisma;

export type AccountStatus = 'DUE' | 'SETTLED' | 'CREDIT';

export interface DelegateAccountSummary {
  delegateId: string;
  tripsRequired: string;
  correctionsNet: string;
  totalRequired: string;
  paymentsTotal: string;
  refundsTotal: string;
  totalPaid: string;
  remaining: string;
  credit: string;
  status: AccountStatus;
}

export interface DelegateTripRequirement {
  delegateId: string;
  tripId: string;
  pricePerPerson: string;
  activePilgrimCount: number;
  requiredAmount: string;
}

const ZERO = () => new Prisma.Decimal(0);

const pairKey = (delegateId: string, tripId: string) => `${delegateId}:${tripId}`;

/** Active pilgrim counts per (delegate, trip). Cancelled pilgrims are excluded. */
const activePilgrimCounts = async (
  db: Db,
  where: Prisma.PilgrimWhereInput,
): Promise<Map<string, number>> => {
  const rows = await db.pilgrim.groupBy({
    by: ['delegateId', 'tripId'],
    where: { ...where, status: 'ACTIVE' },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [pairKey(r.delegateId, r.tripId), r._count._all]));
};

/** Required amount for each DelegateTrip matching `where`. */
export const getDelegateTripRequirements = async (
  where: { delegateIds?: string[]; tripId?: string },
  db: Db = prisma,
): Promise<DelegateTripRequirement[]> => {
  const assignmentWhere: Prisma.DelegateTripWhereInput = {
    ...(where.delegateIds ? { delegateId: { in: where.delegateIds } } : {}),
    ...(where.tripId ? { tripId: where.tripId } : {}),
  };
  const pilgrimWhere: Prisma.PilgrimWhereInput = {
    ...(where.delegateIds ? { delegateId: { in: where.delegateIds } } : {}),
    ...(where.tripId ? { tripId: where.tripId } : {}),
  };

  const [assignments, counts] = await Promise.all([
    db.delegateTrip.findMany({
      where: assignmentWhere,
      select: { delegateId: true, tripId: true, pricePerPerson: true },
    }),
    activePilgrimCounts(db, pilgrimWhere),
  ]);

  return assignments.map((a) => {
    const count = counts.get(pairKey(a.delegateId, a.tripId)) ?? 0;
    return {
      delegateId: a.delegateId,
      tripId: a.tripId,
      pricePerPerson: decimalToJson(a.pricePerPerson)!,
      activePilgrimCount: count,
      requiredAmount: decimalToJson(a.pricePerPerson.mul(count))!,
    };
  });
};

const buildSummary = (
  delegateId: string,
  parts: {
    tripsRequired: Prisma.Decimal;
    correctionsNet: Prisma.Decimal;
    paymentsTotal: Prisma.Decimal;
    refundsTotal: Prisma.Decimal;
  },
): DelegateAccountSummary => {
  const totalRequired = parts.tripsRequired.plus(parts.correctionsNet);
  const totalPaid = parts.paymentsTotal.minus(parts.refundsTotal);
  const net = totalRequired.minus(totalPaid);
  return {
    delegateId,
    tripsRequired: decimalToJson(parts.tripsRequired)!,
    correctionsNet: decimalToJson(parts.correctionsNet)!,
    totalRequired: decimalToJson(totalRequired)!,
    paymentsTotal: decimalToJson(parts.paymentsTotal)!,
    refundsTotal: decimalToJson(parts.refundsTotal)!,
    totalPaid: decimalToJson(totalPaid)!,
    remaining: decimalToJson(net.greaterThan(0) ? net : ZERO())!,
    credit: decimalToJson(net.lessThan(0) ? net.abs() : ZERO())!,
    status: net.greaterThan(0) ? 'DUE' : net.lessThan(0) ? 'CREDIT' : 'SETTLED',
  };
};

/** Account summaries for many delegates with a fixed number of queries. */
export const getDelegateAccounts = async (
  delegateIds: string[],
  db: Db = prisma,
): Promise<Map<string, DelegateAccountSummary>> => {
  const map = new Map<string, DelegateAccountSummary>();
  if (delegateIds.length === 0) return map;

  const [requirements, payments, adjustments] = await Promise.all([
    getDelegateTripRequirements({ delegateIds }, db),
    db.payment.groupBy({
      by: ['delegateId'],
      where: { delegateId: { in: delegateIds }, status: 'ACTIVE' },
      _sum: { amount: true },
    }),
    db.financialAdjustment.groupBy({
      by: ['delegateId', 'type', 'direction'],
      where: { delegateId: { in: delegateIds } },
      _sum: { amount: true },
    }),
  ]);

  for (const delegateId of delegateIds) {
    const tripsRequired = requirements
      .filter((r) => r.delegateId === delegateId)
      .reduce((acc, r) => acc.plus(r.requiredAmount), ZERO());

    const paymentsTotal =
      payments.find((p) => p.delegateId === delegateId)?._sum.amount ?? ZERO();

    let correctionsNet = ZERO();
    let refundsTotal = ZERO();
    for (const row of adjustments) {
      if (row.delegateId !== delegateId) continue;
      const amount = row._sum.amount ?? ZERO();
      if (row.type === 'REFUND') refundsTotal = refundsTotal.plus(amount);
      // CORRECTION INCREASE adds to what the delegate owes, DECREASE deducts.
      else correctionsNet = row.direction === 'INCREASE' ? correctionsNet.plus(amount) : correctionsNet.minus(amount);
    }

    map.set(
      delegateId,
      buildSummary(delegateId, { tripsRequired, correctionsNet, paymentsTotal, refundsTotal }),
    );
  }
  return map;
};

export const getDelegateAccount = async (
  delegateId: string,
  db: Db = prisma,
): Promise<DelegateAccountSummary> => {
  const accounts = await getDelegateAccounts([delegateId], db);
  return accounts.get(delegateId)!;
};

/**
 * حسابات المناديب. Balances are computed (never stored), so the account-state
 * filter and the ordering are applied after computing every matching account
 * with a fixed number of queries, then paginated. Order: amounts still owed
 * first (largest first), then credits (largest first), then settled (by name).
 */
export const listDelegateAccounts = async (query: {
  page: number;
  pageSize: number;
  search?: string;
  accountStatus?: AccountStatus;
}) => {
  const where: Prisma.DelegateWhereInput = query.search
    ? {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
        ],
      }
    : {};
  const delegates = await prisma.delegate.findMany({
    where,
    select: { id: true, name: true, phone: true, status: true, isSystem: true },
  });
  const ids = delegates.map((d) => d.id);
  const [accounts, lastPayments] = await Promise.all([
    getDelegateAccounts(ids),
    prisma.payment.groupBy({
      by: ['delegateId'],
      where: { delegateId: { in: ids }, status: 'ACTIVE' },
      _max: { paymentDate: true },
    }),
  ]);
  const lastPaid = new Map(lastPayments.map((p) => [p.delegateId, p._max.paymentDate]));

  const rows = delegates.map((d) => ({
    ...d,
    account: accounts.get(d.id)!,
    lastPaymentDate: lastPaid.get(d.id)?.toISOString() ?? null,
  }));

  const counts = { ALL: rows.length, DUE: 0, SETTLED: 0, CREDIT: 0 };
  for (const row of rows) counts[row.account.status] += 1;

  const rank: Record<AccountStatus, number> = { DUE: 0, CREDIT: 1, SETTLED: 2 };
  const size = (row: (typeof rows)[number]) =>
    new Prisma.Decimal(row.account.status === 'CREDIT' ? row.account.credit : row.account.remaining);
  const filtered = rows
    .filter((row) => !query.accountStatus || row.account.status === query.accountStatus)
    .sort(
      (a, b) =>
        rank[a.account.status] - rank[b.account.status] ||
        size(b).comparedTo(size(a)) ||
        a.name.localeCompare(b.name, 'ar'),
    );

  const start = (query.page - 1) * query.pageSize;
  return {
    ...buildPage(filtered.slice(start, start + query.pageSize), filtered.length, query.page, query.pageSize),
    counts,
  };
};

/**
 * Full delegate account: per-trip requirements, payment history and — for
 * managers only — the exceptional adjustments (refunds / corrections).
 */
export const getDelegateAccountStatement = async (
  delegateId: string,
  options: { includeAdjustments: boolean },
) => {
  const delegate = await prisma.delegate.findUnique({
    where: { id: delegateId },
    select: { id: true, name: true, phone: true, address: true, status: true, isSystem: true },
  });
  if (!delegate) throw AppError.notFound('المندوب غير موجود');

  const [summary, requirements, assignments, payments, adjustments] = await Promise.all([
    getDelegateAccount(delegateId),
    getDelegateTripRequirements({ delegateIds: [delegateId] }),
    prisma.delegateTrip.findMany({
      where: { delegateId },
      include: {
        trip: { select: { id: true, name: true, departureDate: true, returnDate: true, status: true } },
      },
      orderBy: { trip: { departureDate: 'asc' } },
    }),
    prisma.payment.findMany({
      where: { delegateId },
      orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        createdBy: { select: { id: true, fullName: true } },
        voidedBy: { select: { id: true, fullName: true } },
      },
    }),
    options.includeAdjustments
      ? prisma.financialAdjustment.findMany({
          where: { delegateId },
          orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
          include: { performedBy: { select: { id: true, fullName: true } } },
        })
      : Promise.resolve(null),
  ]);

  const byTrip = new Map(requirements.map((r) => [r.tripId, r]));

  return {
    delegate,
    summary,
    trips: assignments.map((a) => ({
      tripId: a.trip.id,
      tripName: a.trip.name,
      departureDate: a.trip.departureDate.toISOString(),
      returnDate: a.trip.returnDate.toISOString(),
      tripStatus: a.trip.status,
      pricePerPerson: decimalToJson(a.pricePerPerson)!,
      activePilgrimCount: byTrip.get(a.trip.id)?.activePilgrimCount ?? 0,
      requiredAmount: byTrip.get(a.trip.id)?.requiredAmount ?? '0.00',
    })),
    payments: payments.map(serializePaymentRow),
    adjustments:
      adjustments?.map((a) => ({
        id: a.id,
        type: a.type,
        // Effect on what is left to pay: a refund returns paid money, so it
        // increases the remaining amount just like an INCREASE correction.
        effect: adjustmentEffect(a),
        amount: decimalToJson(a.amount)!,
        reason: a.reason,
        effectiveDate: a.effectiveDate.toISOString(),
        createdAt: a.createdAt.toISOString(),
        performedBy: a.performedBy,
      })) ?? null,
    generatedAt: new Date().toISOString(),
  };
};

/** INCREASE / DECREASE of the amount still owed by the delegate. */
export const adjustmentEffect = (a: {
  type: 'REFUND' | 'CORRECTION';
  direction: 'INCREASE' | 'DECREASE' | null;
}): 'INCREASE' | 'DECREASE' => (a.type === 'REFUND' || a.direction === 'INCREASE' ? 'INCREASE' : 'DECREASE');

export type DelegateAccountStatement = Awaited<ReturnType<typeof getDelegateAccountStatement>>;

/** Public shape of a payment row. Never exposes the storage key. */
export const serializePaymentRow = (
  p: Prisma.PaymentGetPayload<{ include: { createdBy: { select: { id: true; fullName: true } } } }> & {
    voidedBy?: { id: string; fullName: string } | null;
    delegate?: { id: string; name: string; phone?: string } | null;
  },
) => ({
  id: p.id,
  delegateId: p.delegateId,
  ...(p.delegate ? { delegate: p.delegate } : {}),
  amount: decimalToJson(p.amount)!,
  receiptNumber: p.receiptNumber,
  legacyReceiptNumber: p.legacyReceiptNumber,
  hasReceiptScan: Boolean(p.receiptScanKey),
  receiptScanMimeType: p.receiptScanMimeType,
  paymentMethod: p.paymentMethod,
  transferType: p.transferType,
  referenceNumber: p.referenceNumber,
  paymentDate: p.paymentDate.toISOString(),
  notes: p.notes,
  status: p.status,
  createdBy: p.createdBy,
  createdAt: p.createdAt.toISOString(),
  voidedAt: p.voidedAt ? p.voidedAt.toISOString() : null,
  voidReason: p.voidReason,
  voidedBy: p.voidedBy ?? null,
});

type PaymentRowOut = ReturnType<typeof serializePaymentRow>;

/**
 * Who voided a payment, when and why is manager-only. Employees still see
 * status VOIDED; the three void-detail fields come back as null.
 */
export const paymentRowForRole = <T extends PaymentRowOut>(row: T, role: Role): T =>
  role === 'MANAGER' ? row : { ...row, voidedAt: null, voidReason: null, voidedBy: null };
