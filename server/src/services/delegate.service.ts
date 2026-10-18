import { DelegateStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../utils/audit';
import { buildPage } from '../utils/pagination';
import { withTransaction } from '../utils/transaction';
import { SYSTEM_DELEGATE_NAME } from '../config/app';
import { tripCapabilities } from './tripRules';

export interface DelegateListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: DelegateStatus;
}

/**
 * A trip is active/upcoming while it has not finished: it is not COMPLETED
 * and its return date is today or later. Shared by every operational view.
 */
export const startOfTodayUtc = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

export const activeTripWhere = (): Prisma.TripWhereInput => ({
  status: { not: 'COMPLETED' },
  returnDate: { gte: startOfTodayUtc() },
});

export const isTripActive = (trip: { status: string; returnDate: Date }): boolean =>
  trip.status !== 'COMPLETED' && trip.returnDate >= startOfTodayUtc();

/** Where a trip is in time; COMPLETED always counts as finished. */
export type TripPhase = 'UPCOMING' | 'ONGOING' | 'FINISHED';
export const tripPhase = (trip: { status: string; departureDate: Date; returnDate: Date }): TripPhase => {
  const today = startOfTodayUtc();
  if (!isTripActive(trip)) return 'FINISHED';
  return trip.departureDate > today ? 'UPCOMING' : 'ONGOING';
};

/** Operational delegate list. Contains no financial data by design. */
export const listDelegates = async (query: DelegateListQuery) => {
  const where: Prisma.DelegateWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.delegate.findMany({
      where,
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        _count: { select: { trips: { where: { trip: activeTripWhere() } } } },
      },
    }),
    prisma.delegate.count({ where }),
  ]);

  const items = rows.map(({ _count, ...row }) => ({
    ...row,
    activeTripCount: _count.trips,
  }));

  return buildPage(items, total, query.page, query.pageSize);
};

/** Operational delegate profile. Financial data lives under /finance. */
export const getDelegateById = async (delegateId: string) => {
  const delegate = await prisma.delegate.findUnique({
    where: { id: delegateId },
    include: {
      _count: {
        select: {
          trips: true,
          pilgrims: { where: { status: 'ACTIVE' } },
        },
      },
    },
  });
  if (!delegate) throw AppError.notFound('المندوب غير موجود');

  const activeTripCount = await prisma.delegateTrip.count({
    where: { delegateId, trip: activeTripWhere() },
  });

  const { _count, ...rest } = delegate;
  return {
    ...rest,
    tripCount: _count.trips,
    activeTripCount,
    activePilgrimCount: _count.pilgrims,
  };
};

/**
 * Trips the delegate is assigned to, with the number of ACTIVE pilgrims that
 * belong to this delegate in each trip. `scope=active` keeps only trips that
 * have not finished (see activeTripWhere).
 */
export const listDelegateTrips = async (delegateId: string, scope: 'active' | 'all') => {
  const delegate = await prisma.delegate.findUnique({ where: { id: delegateId }, select: { id: true } });
  if (!delegate) throw AppError.notFound('المندوب غير موجود');

  const [assignments, counts] = await Promise.all([
    prisma.delegateTrip.findMany({
      where: { delegateId, ...(scope === 'active' ? { trip: activeTripWhere() } : {}) },
      include: {
        trip: {
          select: {
            id: true,
            name: true,
            departureDate: true,
            returnDate: true,
            flightType: true,
            status: true,
          },
        },
      },
      orderBy: { trip: { departureDate: scope === 'active' ? 'asc' : 'desc' } },
    }),
    prisma.pilgrim.groupBy({
      by: ['tripId'],
      where: { delegateId, status: 'ACTIVE' },
      _count: { _all: true },
    }),
  ]);
  const countByTrip = new Map(counts.map((c) => [c.tripId, c._count._all]));

  return assignments.map(({ trip }) => ({
    tripId: trip.id,
    name: trip.name,
    departureDate: trip.departureDate.toISOString(),
    returnDate: trip.returnDate.toISOString(),
    flightType: trip.flightType,
    status: trip.status,
    isActive: isTripActive(trip),
    capabilities: tripCapabilities(trip.status),
    activePilgrimCount: countByTrip.get(trip.id) ?? 0,
  }));
};

export const createDelegate = async (
  actorId: string,
  input: { name: string; phone: string; address: string; notes?: string },
) => {
  assertNotSystemDelegateName(input.name);
  const delegate = await prisma.delegate.create({ data: input });
  await writeAuditLog({
    userId: actorId,
    action: 'DELEGATE_CREATED',
    entityType: 'Delegate',
    entityId: delegate.id,
    newData: { name: delegate.name, phone: delegate.phone },
  });
  return delegate;
};

const assertNotSystemDelegate = (isSystem: boolean) => {
  if (isSystem) throw AppError.badRequest('لا يمكن تعديل المندوب النظامي المخصص لعملاء الشركة');
};

/** Loose Arabic name comparison (spacing, hamza/alef, ta marbuta, alef maqsura, tashkeel). */
const comparableName = (name: string) =>
  name
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Direct company customers always go through the one system delegate, so a
 * normal delegate may not be created or renamed to look like it.
 */
const assertNotSystemDelegateName = (name: string) => {
  if (comparableName(name) === comparableName(SYSTEM_DELEGATE_NAME)) {
    throw AppError.conflict(
      `الاسم "${SYSTEM_DELEGATE_NAME}" محجوز للمندوب النظامي الخاص بعملاء الشركة المباشرين، استخدمه بدلاً من إنشاء مندوب جديد`,
      { field: 'name' },
    );
  }
};

export const updateDelegate = async (
  actorId: string,
  delegateId: string,
  input: Partial<{ name: string; phone: string; address: string; notes?: string | null }>,
) => {
  const current = await prisma.delegate.findUnique({ where: { id: delegateId } });
  if (!current) throw AppError.notFound('المندوب غير موجود');
  assertNotSystemDelegate(current.isSystem);
  if (input.name !== undefined) assertNotSystemDelegateName(input.name);

  return withTransaction(async (tx) => {
    const updated = await tx.delegate.update({ where: { id: delegateId }, data: input });
    await writeAuditLog(
      {
        userId: actorId,
        action: 'DELEGATE_UPDATED',
        entityType: 'Delegate',
        entityId: delegateId,
        oldData: { name: current.name, phone: current.phone, address: current.address },
        newData: { name: updated.name, phone: updated.phone, address: updated.address },
      },
      tx,
    );
    return updated;
  });
};

export const changeDelegateStatus = async (
  actorId: string,
  delegateId: string,
  status: DelegateStatus,
) => {
  const current = await prisma.delegate.findUnique({ where: { id: delegateId } });
  if (!current) throw AppError.notFound('المندوب غير موجود');
  assertNotSystemDelegate(current.isSystem);

  if (current.status === status) return current;

  if (status === DelegateStatus.INACTIVE) {
    const activeTrips = await prisma.delegateTrip.count({
      where: {
        delegateId,
        trip: { status: { in: ['OPEN', 'CLOSED'] } },
      },
    });
    if (activeTrips > 0) {
      throw AppError.badRequest(
        'لا يمكن إيقاف المندوب لوجود رحلات مفتوحة أو قيد التنفيذ مرتبط به، يرجى إغلاق الرحلات أولاً',
      );
    }
  }

  return withTransaction(async (tx) => {
    const updated = await tx.delegate.update({ where: { id: delegateId }, data: { status } });
    await writeAuditLog(
      {
        userId: actorId,
        action: 'DELEGATE_STATUS_CHANGED',
        entityType: 'Delegate',
        entityId: delegateId,
        oldData: { status: current.status },
        newData: { status },
      },
      tx,
    );
    return updated;
  });
};
