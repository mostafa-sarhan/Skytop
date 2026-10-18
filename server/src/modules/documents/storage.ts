import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { DocumentType, Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { assertTripAllowsPilgrimEdits } from '../../services/tripRules';

const ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['application/pdf', '.pdf'],
]);

export const UPLOADS_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR);

export const safeResolve = (relativeKey: string): string => {
  const resolved = path.resolve(UPLOADS_ROOT, relativeKey);
  const rootWithSep = UPLOADS_ROOT.endsWith(path.sep) ? UPLOADS_ROOT : UPLOADS_ROOT + path.sep;
  if (!resolved.startsWith(rootWithSep)) {
    throw AppError.badRequest('مسار الملف غير صالح');
  }
  return resolved;
};

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Real file type from the first bytes (the browser-declared type is not trusted). */
const sniffMime = (buffer: Buffer): string | null => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
};

const maxUploadMb = () => Math.round(env.MAX_UPLOAD_BYTES / (1024 * 1024));

/**
 * Validates an upload before anything is written: allowed type, non-empty,
 * within the size limit, and the content really is that type. Returns the
 * file extension to store it with.
 */
export const assertAllowedFile = (file: UploadedFile, label = 'الملف'): string => {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw AppError.badRequest(`${label}: نوع الملف غير مدعوم، المسموح: JPG, PNG, WEBP, PDF`);
  }
  if (file.size <= 0) throw AppError.badRequest(`${label}: الملف فارغ`);
  if (file.size > env.MAX_UPLOAD_BYTES) {
    throw AppError.badRequest(`${label}: حجم الملف يتجاوز الحد المسموح (${maxUploadMb()} ميجابايت)`);
  }
  if (sniffMime(file.buffer) !== file.mimetype) {
    throw AppError.badRequest(`${label}: محتوى الملف لا يطابق نوعه، المسموح: JPG, PNG, WEBP, PDF`);
  }
  return ALLOWED_MIME.get(file.mimetype)!;
};

const writeBuffer = async (absolutePath: string, buffer: Buffer): Promise<void> => {
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
};

export const removeQuietly = async (storageKey: string): Promise<void> => {
  try {
    await fs.unlink(safeResolve(storageKey));
  } catch (error) {
    logger.warn('document_delete_failed', { storageKey, error });
  }
};

/** A cancelled (مستبعد) pilgrim's documents are preserved read-only. */
const assertDocumentsEditable = (status: string) => {
  if (status === 'CANCELLED') {
    throw AppError.badRequest('المعتمر مستبعد: مستنداته محفوظة للعرض فقط ولا يمكن تعديلها');
  }
};

/** Metadata of a pilgrim document whose file has been written to storage. */
export interface StagedPilgrimDocument {
  type: DocumentType;
  storageKey: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Validates and writes one pilgrim document under a generated, non-guessable
 * key (`<pilgrimId>/<TYPE>_<uuid>.<ext>`). Only metadata goes to the database;
 * the caller must remove the file (discardStagedDocuments) if its database
 * write fails. Swapping local disk for object storage only touches this module.
 */
export const stagePilgrimDocument = async (
  pilgrimId: string,
  type: DocumentType,
  file: UploadedFile,
  label?: string,
): Promise<StagedPilgrimDocument> => {
  const ext = assertAllowedFile(file, label);
  const storageKey = path.join(pilgrimId, `${type}_${crypto.randomUUID()}${ext}`);
  await writeBuffer(safeResolve(storageKey), file.buffer);
  return {
    type,
    storageKey,
    fileName: path.basename(storageKey),
    originalName: file.originalname.slice(0, 255),
    mimeType: file.mimetype,
    sizeBytes: file.size,
  };
};

/** Removes staged files (and their now-empty owner folder) after a failure. */
export const discardStagedDocuments = async (ownerId: string, staged: StagedPilgrimDocument[]) => {
  await Promise.all(staged.map((doc) => removeQuietly(doc.storageKey)));
  try {
    await fs.rmdir(safeResolve(ownerId));
  } catch {
    /* folder not empty or never created */
  }
};

/**
 * Stores the file on disk under a non-guessable key. The URL returned by the
 * API is an authenticated endpoint, never a public static path.
 */
export const upsertPilgrimDocument = async (
  pilgrimId: string,
  type: DocumentType,
  file: UploadedFile,
  actorId: string,
) => {
  assertAllowedFile(file);

  const pilgrim = await prisma.pilgrim.findUnique({
    where: { id: pilgrimId },
    include: { trip: { select: { name: true, status: true } } },
  });
  if (!pilgrim) throw AppError.notFound('المعتمر غير موجود');
  assertDocumentsEditable(pilgrim.status);
  assertTripAllowsPilgrimEdits(pilgrim.trip);

  const { storageKey } = await stagePilgrimDocument(pilgrimId, type, file);

  const existing = await prisma.pilgrimDocument.findUnique({
    where: { pilgrimId_type: { pilgrimId, type } },
  });

  try {
    const row = await prisma.pilgrimDocument.upsert({
      where: { pilgrimId_type: { pilgrimId, type } },
      create: {
        pilgrimId,
        type,
        fileName: path.basename(storageKey),
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        uploadedById: actorId,
      },
      update: {
        fileName: path.basename(storageKey),
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        uploadedById: actorId,
      },
    });

    if (existing && existing.storageKey !== storageKey) {
      await removeQuietly(existing.storageKey);
    }

    return row;
  } catch (error) {
    await removeQuietly(storageKey);
    throw error;
  }
};

export const getPilgrimDocumentFile = async (
  pilgrimId: string,
  type: DocumentType,
): Promise<{ absolutePath: string; mime: string; originalName: string; size: number }> => {
  const doc = await prisma.pilgrimDocument.findUnique({
    where: { pilgrimId_type: { pilgrimId, type } },
  });
  if (!doc) throw AppError.notFound('الملف المطلوب غير موجود لهذا المعتمر');

  const absolutePath = safeResolve(doc.storageKey);
  try {
    await fs.access(absolutePath);
  } catch {
    throw AppError.notFound('ملف الوثيقة غير متاح على الخادم');
  }

  return {
    absolutePath,
    mime: doc.mimeType,
    originalName: doc.originalName,
    size: doc.sizeBytes,
  };
};

export const deletePilgrimDocument = async (
  pilgrimId: string,
  type: DocumentType,
): Promise<void> => {
  const owner = await prisma.pilgrim.findUnique({
    where: { id: pilgrimId },
    select: { status: true, trip: { select: { name: true, status: true } } },
  });
  if (!owner) throw AppError.notFound('المعتمر غير موجود');
  assertDocumentsEditable(owner.status);
  assertTripAllowsPilgrimEdits(owner.trip);

  const doc = await prisma.pilgrimDocument.findUnique({
    where: { pilgrimId_type: { pilgrimId, type } },
  });
  if (!doc) throw AppError.notFound('الملف المطلوب غير موجود لهذا المعتمر');

  await prisma.pilgrimDocument.delete({ where: { id: doc.id } });
  await removeQuietly(doc.storageKey);
};

export const listPilgrimDocuments = async (pilgrimId: string) =>
  prisma.pilgrimDocument.findMany({
    where: { pilgrimId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      type: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      uploadedBy: { select: { id: true, fullName: true } },
    },
  });

/**
 * Stores a private file under `<folder>/<ownerId>/<prefix>_<uuid><ext>` and
 * returns its storage key. Files are only ever served through authenticated
 * endpoints that resolve the key from the database.
 */
export const storePrivateFile = async (
  folder: string,
  ownerId: string,
  prefix: string,
  file: UploadedFile,
): Promise<string> => {
  const ext = assertAllowedFile(file);
  const storageKey = path.join(folder, ownerId, `${prefix}_${crypto.randomUUID()}${ext}`);
  await writeBuffer(safeResolve(storageKey), file.buffer);
  return storageKey;
};

/** Resolves a stored key to an absolute path, failing if the file is gone. */
export const resolveStoredFile = async (storageKey: string): Promise<string> => {
  const absolutePath = safeResolve(storageKey);
  try {
    await fs.access(absolutePath);
  } catch {
    throw AppError.notFound('الملف غير متاح على الخادم');
  }
  return absolutePath;
};
