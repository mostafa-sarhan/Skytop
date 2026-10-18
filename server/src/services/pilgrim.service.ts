import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import {
  assertAllowedFile,
  discardStagedDocuments,
  stagePilgrimDocument,
  StagedPilgrimDocument,
  UploadedFile,
} from '../modules/documents/storage';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../utils/audit';
import { buildPage } from '../utils/pagination';
import { withTransaction } from '../utils/transaction';
import {
  assertTripAcceptsNewPilgrims,
  assertTripAllowsCancellation,
  assertTripAllowsDelegateReassignment,
  assertTripAllowsPilgrimEdits,
  assertTripsAllowTransfer,
  tripCapabilities,
} from './tripRules';

export const DOCUMENT_TYPES = ['PASSPORT_IMAGE', 'PERSONAL_PHOTO'] as const;
export type DocumentStatusValue = 'COMPLETE' | 'MISSING_PASSPORT' | 'MISSING_PHOTO' | 'MISSING_BOTH';

export const computeDocumentStatus = (presentTypes: string[]): DocumentStatusValue => {
  const hasPassport = presentTypes.includes('PASSPORT_IMAGE');
  const hasPhoto = presentTypes.includes('PERSONAL_PHOTO');
  if (hasPassport && hasPhoto) return 'COMPLETE';
  if (!hasPassport && !hasPhoto) return 'MISSING_BOTH';
  if (!hasPassport) return 'MISSING_PASSPORT';
  return 'MISSING_PHOTO';
};

export interface PilgrimListQuery {
  page: number;
  pageSize: number;
  search?: string;
  tripId?: string;
  delegateId?: string;
  documentStatus?: 'ALL' | 'COMPLETE' | 'INCOMPLETE';
  status?: 'ACTIVE' | 'CANCELLED' | 'ALL';
}

export const listPilgrims = async (query: PilgrimListQuery) => {
  const baseWhere: Prisma.PilgrimWhereInput = {
    ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
    ...(query.tripId ? { tripId: query.tripId } : {}),
    ...(query.delegateId ? { delegateId: query.delegateId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { passportNumber: { contains: query.search, mode: 'insensitive' } },
            { nationalId: { contains: query.search } },
          ],
        }
      : {}),
  };

  const include = {
    delegate: { select: { id: true, name: true, phone: true } },
    trip: { select: { id: true, name: true, departureDate: true, status: true } },
    documents: { select: { type: true } },
  } satisfies Prisma.PilgrimInclude;

  const where: Prisma.PilgrimWhereInput =
    query.documentStatus && query.documentStatus !== 'ALL'
      ? {
          ...baseWhere,
          ...(query.documentStatus === 'COMPLETE'
            ? { AND: DOCUMENT_TYPES.map((type) => ({ documents: { some: { type } } })) }
            : {
                OR: DOCUMENT_TYPES.map((type) => ({ documents: { none: { type } } })),
              }),
        }
      : baseWhere;

  const [rows, total] = await Promise.all([
    prisma.pilgrim.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.pilgrim.count({ where }),
  ]);

  const items = rows.map(({ documents, ...pilgrim }) => ({
    ...pilgrim,
    birthDate: pilgrim.birthDate ? pilgrim.birthDate.toISOString() : null,
    documentStatus: computeDocumentStatus(documents.map((d) => d.type)),
  }));

  return buildPage(items, total, query.page, query.pageSize);
};

export const getPilgrimById = async (pilgrimId: string) => {
  const pilgrim = await prisma.pilgrim.findUnique({
    where: { id: pilgrimId },
    include: {
      delegate: { select: { id: true, name: true, phone: true, address: true, status: true } },
      trip: { select: { id: true, name: true, departureDate: true, returnDate: true, status: true } },
      cancelledBy: { select: { id: true, fullName: true } },
      documents: { orderBy: { createdAt: 'asc' } },
      transfers: {
        include: {
          fromTrip: { select: { id: true, name: true } },
          toTrip: { select: { id: true, name: true } },
          performedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!pilgrim) throw AppError.notFound('المعتمر غير موجود');

  const { documents, transfers, ...rest } = pilgrim;
  return {
    ...rest,
    birthDate: pilgrim.birthDate ? pilgrim.birthDate.toISOString() : null,
    cancelledAt: pilgrim.cancelledAt ? pilgrim.cancelledAt.toISOString() : null,
    tripCapabilities: tripCapabilities(pilgrim.trip.status),
    documentStatus: computeDocumentStatus(documents.map((d) => d.type)),
    documents: documents.map((d) => ({
      id: d.id,
      type: d.type,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt,
    })),
    transfers: transfers.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })),
  };
};

interface CreatePilgrimInput {
  name: string;
  passportNumber: string;
  nationalId?: string;
  birthDate?: Date;
  job?: string;
  notes?: string;
  delegateId: string;
  tripId: string;
}

/**
 * Passport / national ID stay unique per trip for ALL statuses, so a cancelled
 * record still blocks a second record of the same person in that trip.
 */
const duplicatePilgrimError = (status: string, where = 'هذه الرحلة') =>
  AppError.conflict(
    status === 'CANCELLED'
      ? `هذا المعتمر مسجّل في ${where} كمستبعد (بنفس رقم الجواز أو الرقم القومي)، ولا يمكن تسجيله مرة ثانية`
      : `يوجد معتمر بنفس رقم جواز السفر أو الرقم القومي في ${where}`,
  );

const assertPilgrimActive = (status: string) => {
  if (status === 'CANCELLED') {
    throw AppError.badRequest('هذا المعتمر ملغى ولا يمكن تعديله أو نقله');
  }
};

const assertDelegateAssignedToTrip = async (delegateId: string, tripId: string) => {
  const assignment = await prisma.delegateTrip.findUnique({
    where: { delegateId_tripId: { delegateId, tripId } },
  });
  if (!assignment) {
    throw AppError.badRequest(
      'يجب إسناد المندوب إلى هذه الرحلة وتحديد سعر الأشخاص قبل إضافة معتمرين',
    );
  }
  return assignment;
};

export interface CreatePilgrimFiles {
  passportImage?: UploadedFile;
  personalPhoto?: UploadedFile;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Creates a pilgrim together with its documents as one operation. The
 * passport image is required; the personal photo is optional.
 *
 *   1. validate everything (files, delegate, trip rules, assignment, duplicates)
 *      before anything is written;
 *   2. write the files to private storage under the new pilgrim's id;
 *   3. create the pilgrim + PilgrimDocument rows in one transaction;
 *   4. on any failure remove the written files — no pilgrim without its
 *      passport, no orphan files.
 */
export const createPilgrim = async (actorId: string, input: CreatePilgrimInput, files: CreatePilgrimFiles) => {
  if (!files.passportImage) {
    throw AppError.badRequest('صورة جواز السفر مطلوبة لإضافة المعتمر', { field: 'passportImage' });
  }
  assertAllowedFile(files.passportImage, 'صورة جواز السفر');
  if (files.personalPhoto) assertAllowedFile(files.personalPhoto, 'الصورة الشخصية');

  const [delegate, trip] = await Promise.all([
    prisma.delegate.findUnique({ where: { id: input.delegateId } }),
    prisma.trip.findUnique({ where: { id: input.tripId } }),
  ]);
  if (!delegate) throw AppError.notFound('المندوب غير موجود');
  if (delegate.status === 'INACTIVE') throw AppError.badRequest('لا يمكن إضافة معتمر لمندوب موقوف');
  if (!trip) throw AppError.notFound('الرحلة غير موجودة');
  assertTripAcceptsNewPilgrims(trip);

  await assertDelegateAssignedToTrip(input.delegateId, input.tripId);

  const duplicate = await prisma.pilgrim.findFirst({
    where: {
      tripId: input.tripId,
      OR: [
        { passportNumber: input.passportNumber },
        ...(input.nationalId ? [{ nationalId: input.nationalId }] : []),
      ],
    },
  });
  if (duplicate) throw duplicatePilgrimError(duplicate.status);

  const pilgrimId = crypto.randomUUID();
  const staged: StagedPilgrimDocument[] = [];
  try {
    staged.push(await stagePilgrimDocument(pilgrimId, 'PASSPORT_IMAGE', files.passportImage, 'صورة جواز السفر'));
    if (files.personalPhoto) {
      staged.push(await stagePilgrimDocument(pilgrimId, 'PERSONAL_PHOTO', files.personalPhoto, 'الصورة الشخصية'));
    }

    // No financial record is created for the pilgrim: the delegate's required
    // amount is derived from the active pilgrim count of the DelegateTrip.
    const pilgrim = await withTransaction(async (tx) => {
      const created = await tx.pilgrim.create({ data: { id: pilgrimId, ...input } });
      await tx.pilgrimDocument.createMany({
        data: staged.map((doc) => ({ ...doc, pilgrimId, uploadedById: actorId })),
      });
      return created;
    });

    return {
      ...pilgrim,
      birthDate: pilgrim.birthDate ? pilgrim.birthDate.toISOString() : null,
      documentStatus: computeDocumentStatus(staged.map((doc) => doc.type)),
      documents: staged.map(({ type, originalName, mimeType, sizeBytes }) => ({ type, originalName, mimeType, sizeBytes })),
    };
  } catch (error) {
    await discardStagedDocuments(pilgrimId, staged);
    // Same passport / national ID created concurrently in this trip.
    if (isUniqueViolation(error)) throw duplicatePilgrimError('ACTIVE');
    throw error;
  }
};

export const updatePilgrim = async (
  actorId: string,
  pilgrimId: string,
  input: Partial<CreatePilgrimInput>,
) => {
  const current = await prisma.pilgrim.findUnique({
    where: { id: pilgrimId },
    include: { trip: { select: { id: true, name: true, status: true } } },
  });
  if (!current) throw AppError.notFound('المعتمر غير موجود');
  assertPilgrimActive(current.status);
  assertTripAllowsPilgrimEdits(current.trip);

  const delegateChanged = input.delegateId !== undefined && input.delegateId !== current.delegateId;
  if (delegateChanged) assertTripAllowsDelegateReassignment(current.trip);
  const passportChanged =
    input.passportNumber !== undefined && input.passportNumber !== current.passportNumber;
  const nationalIdChanged =
    input.nationalId !== undefined && (input.nationalId ?? null) !== current.nationalId;

  if (passportChanged || nationalIdChanged) {
    const duplicate = await prisma.pilgrim.findFirst({
      where: {
        tripId: current.tripId,
        id: { not: pilgrimId },
        OR: [
          ...(input.passportNumber ? [{ passportNumber: input.passportNumber }] : []),
          ...(input.nationalId ? [{ nationalId: input.nationalId }] : []),
        ],
      },
    });
    if (duplicate) throw duplicatePilgrimError(duplicate.status);
  }

  if (!delegateChanged) {
    return prisma.pilgrim.update({ where: { id: pilgrimId }, data: input });
  }

  const newDelegate = await prisma.delegate.findUnique({ where: { id: input.delegateId! } });
  if (!newDelegate) throw AppError.notFound('المندوب الجديد غير موجود');
  if (newDelegate.status === 'INACTIVE') {
    throw AppError.badRequest('لا يمكن إسناد معتمر لمندوب موقوف');
  }
  await assertDelegateAssignedToTrip(input.delegateId!, current.tripId);

  // Moving the pilgrim to another delegate changes both delegates' active
  // counts, so their required amounts update automatically.
  return withTransaction(async (tx) => {
    const updated = await tx.pilgrim.update({ where: { id: pilgrimId }, data: input });

    await writeAuditLog(
      {
        userId: actorId,
        action: 'PILGRIM_TRANSFER',
        entityType: 'Pilgrim',
        entityId: pilgrimId,
        oldData: { delegateId: current.delegateId, tripId: current.tripId },
        newData: {
          delegateId: input.delegateId,
          delegateName: newDelegate.name,
          tripName: current.trip.name,
          reason: 'delegate_reassignment',
        },
      },
      tx,
    );

    return updated;
  });
};

export const transferPilgrim = async (
  actorId: string,
  pilgrimId: string,
  input: { toTripId: string; reason?: string },
) => {
  const pilgrim = await prisma.pilgrim.findUnique({
    where: { id: pilgrimId },
    include: { trip: { select: { id: true, name: true, status: true } } },
  });
  if (!pilgrim) throw AppError.notFound('المعتمر غير موجود');
  assertPilgrimActive(pilgrim.status);
  if (pilgrim.tripId === input.toTripId) throw AppError.badRequest('المعتمر موجود بالفعل في هذه الرحلة');

  const targetTrip = await prisma.trip.findUnique({ where: { id: input.toTripId } });
  if (!targetTrip) throw AppError.notFound('رحلة النقل غير موجودة');
  assertTripsAllowTransfer(pilgrim.trip, targetTrip);

  await assertDelegateAssignedToTrip(pilgrim.delegateId, input.toTripId);

  const duplicate = await prisma.pilgrim.findFirst({
    where: { tripId: input.toTripId, passportNumber: pilgrim.passportNumber },
  });
  if (duplicate) throw duplicatePilgrimError(duplicate.status, 'الرحلة الجديدة');

  // The pilgrim leaves the old DelegateTrip count and joins the new one; the
  // delegate's required amount follows automatically (count × price).
  return withTransaction(async (tx) => {
    const updated = await tx.pilgrim.update({
      where: { id: pilgrimId },
      data: { tripId: input.toTripId },
    });

    const transfer = await tx.pilgrimTransfer.create({
      data: {
        pilgrimId,
        fromTripId: pilgrim.tripId,
        toTripId: input.toTripId,
        reason: input.reason,
        performedById: actorId,
      },
    });

    await writeAuditLog(
      {
        userId: actorId,
        action: 'PILGRIM_TRANSFER',
        entityType: 'Pilgrim',
        entityId: pilgrimId,
        oldData: { tripId: pilgrim.tripId, tripName: pilgrim.trip.name },
        newData: { tripId: input.toTripId, tripName: targetTrip.name, reason: input.reason },
      },
      tx,
    );

    return { pilgrim: updated, transfer };
  });
};

/**
 * Operational workspace: the ACTIVE pilgrims that belong to one delegate in
 * one trip. The delegate must be assigned to the trip; the filter is applied
 * here on the server.
 */
export const listDelegateTripPilgrims = async (
  delegateId: string,
  tripId: string,
  status: 'ACTIVE' | 'CANCELLED' = 'ACTIVE',
) => {
  const [delegate, trip, assignment] = await Promise.all([
    prisma.delegate.findUnique({
      where: { id: delegateId },
      select: { id: true, name: true, phone: true, status: true, isSystem: true },
    }),
    prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        name: true,
        departureDate: true,
        returnDate: true,
        flightType: true,
        status: true,
      },
    }),
    prisma.delegateTrip.findUnique({
      where: { delegateId_tripId: { delegateId, tripId } },
      select: { id: true },
    }),
  ]);
  if (!delegate) throw AppError.notFound('المندوب غير موجود');
  if (!trip) throw AppError.notFound('الرحلة غير موجودة');
  if (!assignment) throw AppError.notFound('هذا المندوب غير مسند إلى هذه الرحلة');

  const [pilgrims, statusCounts] = await Promise.all([
    prisma.pilgrim.findMany({
      where: { delegateId, tripId, status },
      include: {
        documents: { select: { type: true } },
        cancelledBy: { select: { id: true, fullName: true } },
      },
      orderBy: status === 'CANCELLED' ? [{ cancelledAt: 'desc' }] : [{ name: 'asc' }],
    }),
    prisma.pilgrim.groupBy({
      by: ['status'],
      where: { delegateId, tripId },
      _count: { _all: true },
    }),
  ]);
  const countOf = (s: 'ACTIVE' | 'CANCELLED') =>
    statusCounts.find((c) => c.status === s)?._count._all ?? 0;

  const items = pilgrims.map(({ documents, ...p }) => ({
    id: p.id,
    name: p.name,
    passportNumber: p.passportNumber,
    nationalId: p.nationalId,
    birthDate: p.birthDate ? p.birthDate.toISOString() : null,
    job: p.job,
    notes: p.notes,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    cancelledAt: p.cancelledAt ? p.cancelledAt.toISOString() : null,
    cancelReason: p.cancelReason,
    cancelledBy: p.cancelledBy,
    documentStatus: computeDocumentStatus(documents.map((d) => d.type)),
  }));

  return {
    delegate,
    trip: {
      ...trip,
      departureDate: trip.departureDate.toISOString(),
      returnDate: trip.returnDate.toISOString(),
    },
    status,
    capabilities: tripCapabilities(trip.status),
    summary: {
      // `total` / document counts always describe the ACTIVE pilgrims.
      total: countOf('ACTIVE'),
      cancelled: countOf('CANCELLED'),
      completeDocuments:
        status === 'ACTIVE' ? items.filter((i) => i.documentStatus === 'COMPLETE').length : null,
      incompleteDocuments:
        status === 'ACTIVE' ? items.filter((i) => i.documentStatus !== 'COMPLETE').length : null,
    },
    pilgrims: items,
  };
};

/**
 * استبعاد: removes a pilgrim from every active count (and therefore from the
 * delegate's required amount) without deleting anything. Documents, transfer
 * history and audit history are kept. No financial record is written: the
 * required amount is derived from the ACTIVE pilgrim count.
 */
export const cancelPilgrim = async (actorId: string, pilgrimId: string, reason: string) => {
  const pilgrim = await prisma.pilgrim.findUnique({
    where: { id: pilgrimId },
    include: {
      trip: { select: { id: true, name: true, status: true } },
      delegate: { select: { id: true, name: true } },
    },
  });
  if (!pilgrim) throw AppError.notFound('المعتمر غير موجود');
  if (pilgrim.status === 'CANCELLED') throw AppError.badRequest('هذا المعتمر مستبعد بالفعل');
  assertTripAllowsCancellation(pilgrim.trip);

  return withTransaction(async (tx) => {
    const cancelledAt = new Date();
    // Conditional update so two concurrent requests cannot both cancel.
    const changed = await tx.pilgrim.updateMany({
      where: { id: pilgrimId, status: 'ACTIVE' },
      data: { status: 'CANCELLED', cancelledAt, cancelledById: actorId, cancelReason: reason },
    });
    if (changed.count === 0) throw AppError.badRequest('هذا المعتمر مستبعد بالفعل');

    await writeAuditLog(
      {
        userId: actorId,
        action: 'PILGRIM_CANCELLED',
        entityType: 'Pilgrim',
        entityId: pilgrimId,
        oldData: {
          status: 'ACTIVE',
          pilgrimName: pilgrim.name,
          passportNumber: pilgrim.passportNumber,
          tripId: pilgrim.trip.id,
          tripName: pilgrim.trip.name,
          delegateId: pilgrim.delegate.id,
          delegateName: pilgrim.delegate.name,
        },
        newData: { status: 'CANCELLED', reason, cancelledAt },
      },
      tx,
    );

    return tx.pilgrim.findUniqueOrThrow({
      where: { id: pilgrimId },
      select: {
        id: true,
        name: true,
        status: true,
        cancelledAt: true,
        cancelReason: true,
        tripId: true,
        delegateId: true,
      },
    });
  });
};
