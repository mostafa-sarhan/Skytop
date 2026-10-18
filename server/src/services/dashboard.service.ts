import { Prisma, Role } from '@prisma/client';
import { prisma } from '../config/database';
import { decimalToJson } from '../utils/money';
import { activeTripWhere, startOfTodayUtc, tripPhase } from './delegate.service';
import { getDelegateAccounts, paymentRowForRole, serializePaymentRow } from './delegateAccount.service';

const UPCOMING_TRIPS_LIMIT = 5;
const ATTENTION_TRIPS_LIMIT = 3;
const RECENT_PAYMENTS_LIMIT = 5;

/**
 * Active pilgrims whose file is incomplete — same rule as computeDocumentStatus
 * and the missing-documents report (passport image AND personal photo needed).
 */
const incompleteFileWhere: Prisma.PilgrimWhereInput = {
  status: 'ACTIVE',
  OR: [
    { documents: { none: { type: 'PASSPORT_IMAGE' } } },
    { documents: { none: { type: 'PERSONAL_PHOTO' } } },
  ],
};

/**
 * Company-wide totals using the delegate account formula (the same figures
 * as /accounts). Manager only.
 */
const financeOverview = async (today: Date) => {
  const [delegates, paymentCount, todayAgg] = await Promise.all([
    prisma.delegate.findMany({ select: { id: true } }),
    prisma.payment.count({ where: { status: 'ACTIVE' } }),
    prisma.payment.aggregate({ where: { status: 'ACTIVE', paymentDate: today }, _sum: { amount: true } }),
  ]);
  const accounts = [...(await getDelegateAccounts(delegates.map((d) => d.id))).values()];
  const sum = (pick: (a: (typeof accounts)[number]) => string) =>
    decimalToJson(accounts.reduce((acc, a) => acc.plus(pick(a)), new Prisma.Decimal(0)))!;

  return {
    totalRequired: sum((a) => a.totalRequired),
    totalPaid: sum((a) => a.totalPaid),
    totalRemaining: sum((a) => a.remaining),
    totalCredit: sum((a) => a.credit),
    dueDelegates: accounts.filter((a) => a.status === 'DUE').length,
    creditDelegates: accounts.filter((a) => a.status === 'CREDIT').length,
    paymentCount,
    todayAmount: decimalToJson(todayAgg._sum.amount ?? new Prisma.Decimal(0))!,
  };
};

/**
 * Role-aware dashboard. Everything is counted / summed in the database with a
 * fixed number of queries; only small lists (nearest trips, latest payments)
 * are loaded. Company-wide money totals are returned to managers only.
 */
export const dashboardOverview = async (role: Role) => {
  const today = startOfTodayUtc();
  const notFinished = activeTripWhere();

  const [
    upcomingCount,
    ongoingCount,
    activePilgrims,
    cancelledPilgrims,
    activeDelegates,
    totalDelegates,
    incompleteFiles,
    incompleteByTrip,
    nearestTrips,
    todayPayments,
    recentPayments,
    finance,
  ] = await Promise.all([
    prisma.trip.count({ where: { AND: [notFinished, { departureDate: { gt: today } }] } }),
    prisma.trip.count({ where: { AND: [notFinished, { departureDate: { lte: today } }] } }),
    prisma.pilgrim.count({ where: { status: 'ACTIVE' } }),
    prisma.pilgrim.count({ where: { status: 'CANCELLED' } }),
    // The system account «عملاء الشركة المباشرين» is not a real delegate.
    prisma.delegate.count({ where: { status: 'ACTIVE', isSystem: false } }),
    prisma.delegate.count({ where: { isSystem: false } }),
    prisma.pilgrim.count({ where: incompleteFileWhere }),
    prisma.pilgrim.groupBy({ by: ['tripId'], where: incompleteFileWhere, _count: { _all: true } }),
    prisma.trip.findMany({
      where: notFinished,
      orderBy: [{ departureDate: 'asc' }, { name: 'asc' }],
      take: UPCOMING_TRIPS_LIMIT,
      include: { _count: { select: { pilgrims: { where: { status: 'ACTIVE' } }, delegates: true } } },
    }),
    prisma.payment.count({ where: { status: 'ACTIVE', paymentDate: today } }),
    prisma.payment.findMany({
      orderBy: [{ createdAt: 'desc' }],
      take: RECENT_PAYMENTS_LIMIT,
      include: {
        delegate: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
        voidedBy: { select: { id: true, fullName: true } },
      },
    }),
    role === 'MANAGER' ? financeOverview(today) : Promise.resolve(null),
  ]);

  const incompleteMap = new Map(incompleteByTrip.map((row) => [row.tripId, row._count._all]));

  // Trips needing the most document follow-up.
  const attentionRows = [...incompleteByTrip]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, ATTENTION_TRIPS_LIMIT);
  const attentionTrips = attentionRows.length
    ? await prisma.trip.findMany({
        where: { id: { in: attentionRows.map((r) => r.tripId) } },
        select: { id: true, name: true, status: true, departureDate: true, returnDate: true },
      })
    : [];
  const attentionById = new Map(attentionTrips.map((t) => [t.id, t]));

  return {
    trips: { upcoming: upcomingCount, ongoing: ongoingCount },
    pilgrims: { active: activePilgrims, cancelled: cancelledPilgrims },
    delegates: { active: activeDelegates, total: totalDelegates },
    documents: {
      incomplete: incompleteFiles,
      topTrips: attentionRows.flatMap((row) => {
        const trip = attentionById.get(row.tripId);
        return trip
          ? [
              {
                tripId: trip.id,
                tripName: trip.name,
                departureDate: trip.departureDate.toISOString(),
                phase: tripPhase(trip),
                incomplete: row._count._all,
              },
            ]
          : [];
      }),
    },
    upcomingTrips: nearestTrips.map((trip) => ({
      id: trip.id,
      name: trip.name,
      status: trip.status,
      departureDate: trip.departureDate.toISOString(),
      returnDate: trip.returnDate.toISOString(),
      phase: tripPhase(trip),
      delegateCount: trip._count.delegates,
      activePilgrimCount: trip._count.pilgrims,
      incompleteDocuments: incompleteMap.get(trip.id) ?? 0,
    })),
    payments: {
      todayCount: todayPayments,
      recent: recentPayments.map((p) => paymentRowForRole(serializePaymentRow(p), role)),
    },
    finance,
  };
};

export type DashboardOverview = Awaited<ReturnType<typeof dashboardOverview>>;
