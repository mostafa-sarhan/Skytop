import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { dateRangeFilter } from '../utils/dateRange';
import { AppError } from '../utils/AppError';
import { decimalToJson } from '../utils/money';
import { computeDocumentStatus, listDelegateTripPilgrims } from './pilgrim.service';
import { compareArabic, sortByArabic } from '../utils/arabicSort';

export interface ReportMeta {
  title: string;
  generatedAt: string;
  filters: Record<string, string | null>;
}

const isoDate = (value: Date | string | null | undefined): string =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

/** One line of a passenger list (كشف المعتمرين). Operational fields only. */
const passengerRow = (
  index: number,
  p: {
    name: string;
    job: string | null;
    address: string | null;
    passportNumber: string;
    nationalId: string | null;
    birthDate: Date | string | null;
    documentStatus: ReturnType<typeof computeDocumentStatus>;
  },
) => ({
  index,
  name: p.name,
  job: p.job ?? '',
  address: p.address ?? '',
  passportNumber: p.passportNumber,
  nationalId: p.nationalId ?? '',
  birthDate: isoDate(p.birthDate),
  documentStatus: p.documentStatus,
});

const tripContext = (trip: { id: string; name: string; departureDate: Date | string; returnDate: Date | string; status: string }) => ({
  id: trip.id,
  name: trip.name,
  status: trip.status,
  departureDate: isoDate(trip.departureDate),
  returnDate: isoDate(trip.returnDate),
});

const documentSummary = (rows: Array<{ documentStatus: string }>) => ({
  total: rows.length,
  completeDocuments: rows.filter((r) => r.documentStatus === 'COMPLETE').length,
  incompleteDocuments: rows.filter((r) => r.documentStatus !== 'COMPLETE').length,
});

/**
 * كشف معتمري رحلة: every ACTIVE pilgrim of the trip, grouped by delegate
 * (delegate name, then pilgrim name). One query.
 */
export const tripPilgrimsReport = async (tripId: string) => {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw AppError.notFound('الرحلة غير موجودة');

  const pilgrims = await prisma.pilgrim.findMany({
    where: { tripId, status: 'ACTIVE' },
    select: {
      name: true,
      job: true,
      address: true,
      passportNumber: true,
      nationalId: true,
      birthDate: true,
      delegate: { select: { id: true, name: true } },
      documents: { select: { type: true } },
    },
  });

  const ordered = sortByArabic(pilgrims, (p) => p.delegate.name, (p) => p.name);
  const rows = ordered.map((p, index) => ({
    ...passengerRow(index + 1, { ...p, documentStatus: computeDocumentStatus(p.documents.map((d) => d.type)) }),
    delegateId: p.delegate.id,
    delegateName: p.delegate.name,
  }));

  const groups: Array<{ delegateName: string; count: number }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.delegateName === row.delegateName) last.count += 1;
    else groups.push({ delegateName: row.delegateName, count: 1 });
  }

  return {
    meta: {
      title: 'كشف معتمري الرحلة',
      generatedAt: new Date().toISOString(),
      filters: { trip: trip.name },
    } satisfies ReportMeta,
    trip: tripContext(trip),
    groups,
    rows,
    summary: { ...documentSummary(rows), delegates: groups.length },
  };
};

/**
 * كشف معتمري مندوب داخل رحلة: the same ACTIVE list the delegate-trip
 * workspace shows (same service, same rules), as a passenger list.
 */
export const delegateTripPilgrimsReport = async (delegateId: string, tripId: string) => {
  const workspace = await listDelegateTripPilgrims(delegateId, tripId, 'ACTIVE');
  const rows = workspace.pilgrims.map((p, index) => passengerRow(index + 1, p));

  return {
    meta: {
      title: 'كشف معتمري المندوب',
      generatedAt: new Date().toISOString(),
      filters: { trip: workspace.trip.name, delegate: workspace.delegate.name },
    } satisfies ReportMeta,
    trip: tripContext(workspace.trip),
    delegate: { id: workspace.delegate.id, name: workspace.delegate.name, phone: workspace.delegate.phone },
    rows,
    summary: documentSummary(rows),
  };
};

/** Same rule as computeDocumentStatus: passport image AND personal photo. */
const incompleteWhere: Prisma.PilgrimWhereInput = {
  OR: [
    { documents: { none: { type: 'PASSPORT_IMAGE' } } },
    { documents: { none: { type: 'PERSONAL_PHOTO' } } },
  ],
};

/**
 * كشف النواقص: ACTIVE pilgrims with an incomplete file, optionally for one
 * trip and/or one delegate. Only the incomplete rows are loaded.
 */
export const missingDocumentsReport = async (filters: { tripId?: string; delegateId?: string }) => {
  const scope: Prisma.PilgrimWhereInput = {
    status: 'ACTIVE',
    ...(filters.tripId ? { tripId: filters.tripId } : {}),
    ...(filters.delegateId ? { delegateId: filters.delegateId } : {}),
  };

  const [pilgrims, total, trip, delegate] = await Promise.all([
    prisma.pilgrim.findMany({
      where: { AND: [scope, incompleteWhere] },
      select: {
        name: true,
        passportNumber: true,
        delegate: { select: { name: true } },
        trip: { select: { name: true, departureDate: true } },
        documents: { select: { type: true } },
      },
      orderBy: [{ trip: { departureDate: 'asc' } }],
    }),
    prisma.pilgrim.count({ where: scope }),
    filters.tripId ? prisma.trip.findUnique({ where: { id: filters.tripId } }) : null,
    filters.delegateId ? prisma.delegate.findUnique({ where: { id: filters.delegateId } }) : null,
  ]);
  if (filters.tripId && !trip) throw AppError.notFound('الرحلة غير موجودة');
  if (filters.delegateId && !delegate) throw AppError.notFound('المندوب غير موجود');

  // Trips by departure date, then trip / delegate / pilgrim names (Arabic order).
  const ordered = [...pilgrims].sort(
    (a, b) =>
      a.trip.departureDate.getTime() - b.trip.departureDate.getTime() ||
      compareArabic(a.trip.name, b.trip.name) ||
      compareArabic(a.delegate.name, b.delegate.name) ||
      compareArabic(a.name, b.name),
  );
  const rows = ordered.map((p, index) => {
    const types = p.documents.map((d) => d.type);
    return {
      index: index + 1,
      name: p.name,
      passportNumber: p.passportNumber,
      tripName: p.trip.name,
      tripDepartureDate: isoDate(p.trip.departureDate),
      delegateName: p.delegate.name,
      documentStatus: computeDocumentStatus(types),
      hasPassportImage: types.includes('PASSPORT_IMAGE'),
      hasPersonalPhoto: types.includes('PERSONAL_PHOTO'),
    };
  });

  return {
    meta: {
      title: 'كشف النواقص',
      generatedAt: new Date().toISOString(),
      filters: { trip: trip?.name ?? null, delegate: delegate?.name ?? null },
    } satisfies ReportMeta,
    rows,
    summary: {
      total,
      incomplete: rows.length,
      missingPassport: rows.filter((r) => !r.hasPassportImage).length,
      missingPhoto: rows.filter((r) => !r.hasPersonalPhoto).length,
    },
  };
};

/** سجل الدفعات for a delegate and/or period. Void details are not included. */
export const paymentHistoryReport = async (filters: {
  delegateId?: string;
  from?: Date;
  to?: Date;
}) => {
  const where: Prisma.PaymentWhereInput = {
    ...(filters.delegateId ? { delegateId: filters.delegateId } : {}),
    ...(filters.from || filters.to ? { paymentDate: dateRangeFilter(filters.from, filters.to) } : {}),
  };

  const [payments, activeTotal, delegate] = await Promise.all([
    prisma.payment.findMany({
      where,
      select: {
        receiptNumber: true,
        legacyReceiptNumber: true,
        amount: true,
        paymentMethod: true,
        transferType: true,
        referenceNumber: true,
        paymentDate: true,
        status: true,
        delegate: { select: { name: true } },
        createdBy: { select: { fullName: true } },
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.payment.aggregate({ where: { ...where, status: 'ACTIVE' }, _sum: { amount: true } }),
    filters.delegateId ? prisma.delegate.findUnique({ where: { id: filters.delegateId }, select: { name: true } }) : null,
  ]);

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

  return {
    meta: {
      title: 'سجل الدفعات',
      generatedAt: new Date().toISOString(),
      filters: {
        delegate: delegate?.name ?? null,
        from: filters.from ? isoDate(filters.from) : null,
        to: filters.to ? isoDate(filters.to) : null,
      },
    } satisfies ReportMeta,
    rows,
    summary: {
      count: rows.length,
      activeCount: rows.filter((r) => r.status === 'ACTIVE').length,
      totalActive: decimalToJson(activeTotal._sum.amount ?? new Prisma.Decimal(0))!,
    },
  };
};
