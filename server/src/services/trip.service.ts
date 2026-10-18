import { FlightType, Prisma, TripStatus } from '@prisma/client';
import { activeTripWhere, tripPhase } from './delegate.service';
import { computeDocumentStatus } from './pilgrim.service';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../utils/audit';
import { decimalToJson } from '../utils/money';
import { buildPage } from '../utils/pagination';
import { withTransaction } from '../utils/transaction';
import { assertTripAcceptsNewDelegates, assertTripEditable, tripCapabilities } from './tripRules';

export interface TripListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: TripStatus;
}

/**
 * Operational trip list: trips that have not finished come first (soonest
 * departure first), finished / completed trips after them (most recent
 * first). Counts are ACTIVE pilgrims only. No financial data.
 */
export const listTrips = async (query: TripListQuery) => {
  const where: Prisma.TripWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };
  const activeWhere: Prisma.TripWhereInput = { AND: [where, activeTripWhere()] };
  const finishedWhere: Prisma.TripWhereInput = { AND: [where, { NOT: activeTripWhere() }] };

  const [activeTotal, finishedTotal] = await Promise.all([
    prisma.trip.count({ where: activeWhere }),
    prisma.trip.count({ where: finishedWhere }),
  ]);

  // Page window over [active trips..., finished trips...].
  const skip = (query.page - 1) * query.pageSize;
  const activeTake = Math.max(0, Math.min(query.pageSize, activeTotal - skip));
  const finishedSkip = Math.max(0, skip - activeTotal);
  const finishedTake = query.pageSize - activeTake;

  const include = {
    _count: { select: { pilgrims: { where: { status: 'ACTIVE' as const } }, delegates: true } },
  } satisfies Prisma.TripInclude;

  const [activeRows, finishedRows] = await Promise.all([
    activeTake > 0
      ? prisma.trip.findMany({
          where: activeWhere,
          orderBy: [{ departureDate: 'asc' }, { name: 'asc' }],
          skip,
          take: activeTake,
          include,
        })
      : [],
    finishedTake > 0
      ? prisma.trip.findMany({
          where: finishedWhere,
          orderBy: [{ departureDate: 'desc' }, { name: 'asc' }],
          skip: finishedSkip,
          take: finishedTake,
          include,
        })
      : [],
  ]);

  const items = [...activeRows, ...finishedRows].map(({ _count, ...trip }) => ({
    ...trip,
    departureDate: trip.departureDate.toISOString(),
    returnDate: trip.returnDate.toISOString(),
    phase: tripPhase(trip),
    capabilities: tripCapabilities(trip.status),
    pilgrimCount: _count.pilgrims,
    delegateCount: _count.delegates,
  }));

  return buildPage(items, activeTotal + finishedTotal, query.page, query.pageSize);
};

/**
 * Trip workspace: header data, an operational summary and the participating
 * delegates with their ACTIVE pilgrim count and missing-document count.
 * Price per person is included (employees set it); totals owed are not.
 */
export const getTripById = async (tripId: string) => {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      delegates: {
        include: {
          delegate: { select: { id: true, name: true, phone: true, status: true, isSystem: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!trip) throw AppError.notFound('الرحلة غير موجودة');

  const [activePilgrims, lockedDelegateIds] = await Promise.all([
    prisma.pilgrim.findMany({
      where: { tripId, status: 'ACTIVE' },
      select: { delegateId: true, documents: { select: { type: true } } },
    }),
    lockedAssignments(tripId),
  ]);

  const perDelegate = new Map<string, { active: number; incomplete: number }>();
  let incompleteTotal = 0;
  for (const p of activePilgrims) {
    const row = perDelegate.get(p.delegateId) ?? { active: 0, incomplete: 0 };
    row.active += 1;
    if (computeDocumentStatus(p.documents.map((d) => d.type)) !== 'COMPLETE') {
      row.incomplete += 1;
      incompleteTotal += 1;
    }
    perDelegate.set(p.delegateId, row);
  }

  return {
    id: trip.id,
    name: trip.name,
    flightType: trip.flightType,
    status: trip.status,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
    departureDate: trip.departureDate.toISOString(),
    returnDate: trip.returnDate.toISOString(),
    phase: tripPhase(trip),
    capabilities: tripCapabilities(trip.status),
    pilgrimCount: activePilgrims.length,
    summary: {
      delegateCount: trip.delegates.length,
      activePilgrimCount: activePilgrims.length,
      incompleteDocumentCount: incompleteTotal,
    },
    delegates: trip.delegates.map((dt) => ({
      id: dt.id,
      pricePerPerson: decimalToJson(dt.pricePerPerson),
      createdAt: dt.createdAt,
      delegate: dt.delegate,
      pilgrimCount: perDelegate.get(dt.delegate.id)?.active ?? 0,
      incompleteDocumentCount: perDelegate.get(dt.delegate.id)?.incomplete ?? 0,
      priceLocked: lockedDelegateIds.has(dt.delegate.id),
    })),
  };
};

/**
 * A DelegateTrip price is locked once that specific assignment has
 * operational activity: any pilgrim of this delegate in this trip (active or
 * cancelled) or any pilgrim transfer into / out of this trip for this delegate.
 */
const lockedAssignments = async (tripId: string): Promise<Set<string>> => {
  const [pilgrims, transfers] = await Promise.all([
    prisma.pilgrim.findMany({ where: { tripId }, select: { delegateId: true }, distinct: ['delegateId'] }),
    prisma.pilgrimTransfer.findMany({
      where: { OR: [{ fromTripId: tripId }, { toTripId: tripId }] },
      select: { pilgrim: { select: { delegateId: true } } },
    }),
  ]);
  return new Set([
    ...pilgrims.map((p) => p.delegateId),
    ...transfers.map((t) => t.pilgrim.delegateId),
  ]);
};

export const createTrip = async (
  input: {
    name: string;
    departureDate: Date;
    returnDate: Date;
    flightType: FlightType;
    status?: TripStatus;
  },
) => prisma.trip.create({ data: input });

export const updateTrip = async (
  tripId: string,
  input: Partial<{
    name: string;
    departureDate: Date;
    returnDate: Date;
    flightType: FlightType;
    status: TripStatus;
  }>,
) => {
  const current = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!current) throw AppError.notFound('الرحلة غير موجودة');
  // A status change is always possible (e.g. reopening); other fields follow the rules.
  if (Object.keys(input).some((key) => key !== 'status')) assertTripEditable(current);

  const departureDate = input.departureDate ?? current.departureDate;
  const returnDate = input.returnDate ?? current.returnDate;
  if (returnDate < departureDate) {
    throw AppError.badRequest('تاريخ العودة لا يمكن أن يكون قبل تاريخ السفر');
  }

  return prisma.trip.update({ where: { id: tripId }, data: input });
};

export const assignDelegateToTrip = async (
  tripId: string,
  delegateId: string,
  pricePerPerson: string,
) => {
  const [trip, delegate] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId } }),
    prisma.delegate.findUnique({ where: { id: delegateId } }),
  ]);
  if (!trip) throw AppError.notFound('الرحلة غير موجودة');
  if (!delegate) throw AppError.notFound('المندوب غير موجود');
  assertTripAcceptsNewDelegates(trip);
  if (delegate.status === 'INACTIVE') {
    throw AppError.badRequest('لا يمكن إسناد مندوب موقوف إلى رحلة');
  }

  const existing = await prisma.delegateTrip.findUnique({
    where: { delegateId_tripId: { delegateId, tripId } },
  });
  if (existing) throw AppError.conflict('هذا المندوب مسند إلى هذه الرحلة بالفعل');

  return prisma.delegateTrip.create({
    data: { tripId, delegateId, pricePerPerson },
    include: { delegate: { select: { id: true, name: true, phone: true } } },
  });
};

const hasOperationalActivity = async (delegateId: string, tripId: string) => {
  const pilgrimCount = await prisma.pilgrim.count({ where: { delegateId, tripId } });
  if (pilgrimCount > 0) return true;
  const transferCount = await prisma.pilgrimTransfer.count({
    where: {
      pilgrim: { delegateId },
      OR: [{ fromTripId: tripId }, { toTripId: tripId }],
    },
  });
  return transferCount > 0;
};

/**
 * DelegateTrip.pricePerPerson is the current agreed price and applies to ALL
 * active pilgrims of that delegate in that trip (there are no per-pilgrim
 * prices). Employees may set it while the assignment has no operational
 * activity; afterwards the change is manager-only and needs a reason. Every
 * change is written to the audit log so the old price remains visible.
 */
export const updateDelegatePrice = async (
  actor: { id: string; role: string },
  tripId: string,
  delegateId: string,
  pricePerPerson: string,
  reason?: string,
) => {
  const assignment = await prisma.delegateTrip.findUnique({
    where: { delegateId_tripId: { delegateId, tripId } },
  });
  if (!assignment) throw AppError.notFound('إسناد المندوب إلى الرحلة غير موجود');

  if (assignment.pricePerPerson.toFixed(2) === pricePerPerson) {
    throw AppError.badRequest('السعر الجديد مطابق للسعر الحالي');
  }

  const locked = await hasOperationalActivity(delegateId, tripId);
  if (locked) {
    if (actor.role !== 'MANAGER') {
      throw AppError.forbidden(
        'سعر المندوب في هذه الرحلة مقفل لوجود معتمرين مسجلين، التعديل متاح لمدير النظام فقط',
      );
    }
    if (!reason || reason.trim().length < 3) {
      throw AppError.badRequest('يجب إدخال سبب تعديل السعر', { field: 'reason' });
    }
  }

  return withTransaction(async (tx) => {
    const updated = await tx.delegateTrip.update({
      where: { id: assignment.id },
      data: { pricePerPerson },
      include: { delegate: { select: { id: true, name: true } } },
    });

    await writeAuditLog(
      {
        userId: actor.id,
        action: 'DELEGATE_PRICE_CHANGE',
        entityType: 'DelegateTrip',
        entityId: assignment.id,
        oldData: {
          pricePerPerson: decimalToJson(assignment.pricePerPerson),
          tripId,
          delegateId,
        },
        newData: {
          pricePerPerson,
          tripId,
          delegateId,
          locked,
          ...(reason ? { reason } : {}),
          appliesTo: 'all_active_pilgrims',
        },
      },
      tx,
    );

    return { ...updated, pricePerPerson: decimalToJson(updated.pricePerPerson) };
  });
};
