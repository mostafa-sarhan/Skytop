import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { dateRangeFilter } from '../utils/dateRange';
import { AppError } from '../utils/AppError';
import { decimalToJson } from '../utils/money';
import { computeDocumentStatus } from './pilgrim.service';
import { getDelegateAccount, getDelegateAccounts } from './delegateAccount.service';

export interface ReportMeta {
  title: string;
  generatedAt: string;
  filters: Record<string, string | null>;
}

const isoDate = (value: Date | null | undefined): string =>
  value ? value.toISOString().slice(0, 10) : '';

export const tripPilgrimsReport = async (tripId: string) => {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw AppError.notFound('الرحلة غير موجودة');

  const pilgrims = await prisma.pilgrim.findMany({
    where: { tripId, status: 'ACTIVE' },
    include: {
      delegate: { select: { id: true, name: true } },
      documents: { select: { type: true } },
    },
    orderBy: [{ delegate: { name: 'asc' } }, { name: 'asc' }],
  });

  const rows = pilgrims.map((p, index) => ({
    index: index + 1,
    name: p.name,
    passportNumber: p.passportNumber,
    nationalId: p.nationalId ?? '',
    birthDate: isoDate(p.birthDate),
    job: p.job ?? '',
    delegateName: p.delegate.name,
    documentStatus: computeDocumentStatus(p.documents.map((d) => d.type)),
  }));

  return {
    meta: {
      title: 'قائمة معتمري الرحلة',
      generatedAt: new Date().toISOString(),
      filters: { trip: trip.name },
    } satisfies ReportMeta,
    trip: { id: trip.id, name: trip.name, departureDate: isoDate(trip.departureDate), returnDate: isoDate(trip.returnDate) },
    rows,
    summary: {
      total: rows.length,
      completeDocuments: rows.filter((r) => r.documentStatus === 'COMPLETE').length,
      incompleteDocuments: rows.filter((r) => r.documentStatus !== 'COMPLETE').length,
    },
  };
};

export const delegatePilgrimsReport = async (delegateId: string) => {
  const delegate = await prisma.delegate.findUnique({ where: { id: delegateId } });
  if (!delegate) throw AppError.notFound('المندوب غير موجود');

  const pilgrims = await prisma.pilgrim.findMany({
    where: { delegateId, status: 'ACTIVE' },
    include: {
      trip: { select: { id: true, name: true, departureDate: true } },
      documents: { select: { type: true } },
    },
    orderBy: [{ trip: { name: 'asc' } }, { name: 'asc' }],
  });

  const rows = pilgrims.map((p, index) => ({
    index: index + 1,
    name: p.name,
    passportNumber: p.passportNumber,
    nationalId: p.nationalId ?? '',
    birthDate: isoDate(p.birthDate),
    job: p.job ?? '',
    tripName: p.trip.name,
    documentStatus: computeDocumentStatus(p.documents.map((d) => d.type)),
  }));

  const account = await getDelegateAccount(delegateId);

  return {
    meta: {
      title: 'قائمة معتمري المندوب',
      generatedAt: new Date().toISOString(),
      filters: { delegate: delegate.name },
    } satisfies ReportMeta,
    delegate: { id: delegate.id, name: delegate.name, phone: delegate.phone },
    rows,
    summary: {
      total: rows.length,
      completeDocuments: rows.filter((r) => r.documentStatus === 'COMPLETE').length,
      incompleteDocuments: rows.filter((r) => r.documentStatus !== 'COMPLETE').length,
      tripsRequired: account.tripsRequired,
    },
  };
};

export const missingDocumentsReport = async (filters: { tripId?: string; delegateId?: string }) => {
  const where: Prisma.PilgrimWhereInput = {
    status: 'ACTIVE',
    ...(filters.tripId ? { tripId: filters.tripId } : {}),
    ...(filters.delegateId ? { delegateId: filters.delegateId } : {}),
  };

  const [pilgrims, trip, delegate] = await Promise.all([
    prisma.pilgrim.findMany({
      where,
      include: {
        delegate: { select: { id: true, name: true } },
        trip: { select: { id: true, name: true } },
        documents: { select: { type: true } },
      },
      orderBy: [{ trip: { name: 'asc' } }, { name: 'asc' }],
    }),
    filters.tripId ? prisma.trip.findUnique({ where: { id: filters.tripId } }) : null,
    filters.delegateId ? prisma.delegate.findUnique({ where: { id: filters.delegateId } }) : null,
  ]);

  const rows = pilgrims
    .map((p) => {
      const status = computeDocumentStatus(p.documents.map((d) => d.type));
      return {
        name: p.name,
        passportNumber: p.passportNumber,
        tripName: p.trip.name,
        delegateName: p.delegate.name,
        documentStatus: status,
        hasPassportImage: p.documents.some((d) => d.type === 'PASSPORT_IMAGE'),
        hasPersonalPhoto: p.documents.some((d) => d.type === 'PERSONAL_PHOTO'),
      };
    })
    .filter((r) => r.documentStatus !== 'COMPLETE');

  return {
    meta: {
      title: 'تقرير الوثائق الناقصة',
      generatedAt: new Date().toISOString(),
      filters: { trip: trip?.name ?? null, delegate: delegate?.name ?? null },
    } satisfies ReportMeta,
    rows,
    summary: {
      total: pilgrims.length,
      incomplete: rows.length,
      missingPassport: rows.filter((r) => !r.hasPassportImage).length,
      missingPhoto: rows.filter((r) => !r.hasPersonalPhoto).length,
    },
  };
};

export const paymentHistoryReport = async (filters: {
  delegateId?: string;
  from?: Date;
  to?: Date;
}) => {
  const where: Prisma.PaymentWhereInput = {
    ...(filters.delegateId ? { delegateId: filters.delegateId } : {}),
    ...(filters.from || filters.to ? { paymentDate: dateRangeFilter(filters.from, filters.to) } : {}),
  };

  const payments = await prisma.payment.findMany({
    where,
    include: {
      delegate: { select: { name: true } },
      createdBy: { select: { fullName: true } },
    },
    orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    take: 5000,
  });

  const rows = payments.map((p, index) => ({
    index: index + 1,
    receiptNumber: p.receiptNumber ?? (p.legacyReceiptNumber ? `${p.legacyReceiptNumber} (قديم)` : ''),
    delegateName: p.delegate.name,
    amount: decimalToJson(p.amount)!,
    paymentMethod: p.paymentMethod,
    transferType: p.transferType ?? '',
    referenceNumber: p.referenceNumber ?? '',
    paymentDate: isoDate(p.paymentDate),
    status: p.status,
    createdBy: p.createdBy.fullName,
  }));

  const totalActive = payments
    .filter((p) => p.status === 'ACTIVE')
    .reduce((acc, p) => acc.plus(p.amount), Prisma.Decimal(0));

  return {
    meta: {
      title: 'سجل الدفعات',
      generatedAt: new Date().toISOString(),
      filters: {
        delegate: null,
        from: filters.from ? isoDate(filters.from) : null,
        to: filters.to ? isoDate(filters.to) : null,
      },
    } satisfies ReportMeta,
    rows,
    summary: { count: rows.length, totalActive: decimalToJson(totalActive)! },
  };
};

export const dashboardStats = async () => {
  const [
    totalTrips,
    openTrips,
    totalPilgrims,
    totalDelegates,
    activeDelegates,
    paymentsAgg,
    incompleteDocs,
  ] = await Promise.all([
    prisma.trip.count(),
    prisma.trip.count({ where: { status: 'OPEN' } }),
    prisma.pilgrim.count({ where: { status: 'ACTIVE' } }),
    prisma.delegate.count(),
    prisma.delegate.count({ where: { status: 'ACTIVE' } }),
    prisma.payment.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.pilgrim
      .count({
        where: {
          status: 'ACTIVE',
          OR: [
            { documents: { none: { type: 'PASSPORT_IMAGE' } } },
            { documents: { none: { type: 'PERSONAL_PHOTO' } } },
          ],
        },
      })
      .catch(() => 0),
  ]);

  const delegates = await prisma.delegate.findMany({ select: { id: true } });
  const accounts = await getDelegateAccounts(delegates.map((d) => d.id));
  const totalOutstanding = [...accounts.values()].reduce(
    (acc, a) => acc.plus(a.remaining),
    Prisma.Decimal(0),
  );

  return {
    totalTrips,
    openTrips,
    totalPilgrims,
    totalDelegates,
    activeDelegates,
    totalCollected: decimalToJson(paymentsAgg._sum.amount ?? Prisma.Decimal(0))!,
    paymentCount: paymentsAgg._count,
    incompleteDocuments: incompleteDocs,
    totalOutstanding: decimalToJson(totalOutstanding)!,
  };
};
