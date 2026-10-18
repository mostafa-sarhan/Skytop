import { Request, Response } from 'express';
import { DocumentType } from '@prisma/client';
import { getParams, getQuery } from '../middlewares/validate';
import * as pilgrimService from '../services/pilgrim.service';
import * as documentStorage from '../modules/documents/storage';
import { getActor } from '../utils/actor';
import { created, ok, paginated } from '../utils/http';
import { PilgrimListQuery } from '../validators';
import { AppError } from '../utils/AppError';
import { contentDisposition } from '../utils/contentDisposition';

export const list = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<PilgrimListQuery>(req);
  paginated(res, await pilgrimService.listPilgrims(query));
};

export const filterOptions = async (_req: Request, res: Response): Promise<void> => {
  ok(res, await pilgrimService.pilgrimFilterOptions());
};

export const getById = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  ok(res, await pilgrimService.getPilgrimById(id));
};

export const create = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const files = (req.files ?? {}) as Partial<Record<'passportImage' | 'personalPhoto', Express.Multer.File[]>>;
  created(
    res,
    await pilgrimService.createPilgrim(actor.id, req.body, {
      passportImage: files.passportImage?.[0],
      personalPhoto: files.personalPhoto?.[0],
    }),
  );
};

export const update = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const { id } = getParams<{ id: string }>(req);
  ok(res, await pilgrimService.updatePilgrim(actor.id, id, req.body));
};

export const cancel = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const { id } = getParams<{ id: string }>(req);
  const { reason } = req.body as { reason: string };
  ok(res, await pilgrimService.cancelPilgrim(actor.id, id, reason));
};

export const transfer = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const { id } = getParams<{ id: string }>(req);
  ok(res, await pilgrimService.transferPilgrim(actor.id, id, req.body));
};

export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const { id } = getParams<{ id: string }>(req);
  const type = (req.query.type ?? req.body?.type) as DocumentType;
  if (type !== DocumentType.PASSPORT_IMAGE && type !== DocumentType.PERSONAL_PHOTO) {
    throw AppError.badRequest('نوع الوثيقة غير صحيح');
  }
  const file = req.file;
  if (!file) throw AppError.badRequest('يجب اختيار ملف للرفع');
  const row = await documentStorage.upsertPilgrimDocument(id, type, file, actor.id);
  created(res, {
    id: row.id,
    type: row.type,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    downloadUrl: `/api/v1/documents/${id}/${row.type}`,
  });
};

export const listDocuments = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  ok(res, await documentStorage.listPilgrimDocuments(id));
};

export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  const { id, type } = getParams<{ id: string; type: 'PASSPORT_IMAGE' | 'PERSONAL_PHOTO' }>(req);
  await documentStorage.deletePilgrimDocument(id, type);
  ok(res, { deleted: true });
};

export const downloadDocument = async (req: Request, res: Response): Promise<void> => {
  const { pilgrimId, type } = getParams<{
    pilgrimId: string;
    type: 'PASSPORT_IMAGE' | 'PERSONAL_PHOTO';
  }>(req);
  const file = await documentStorage.getPilgrimDocumentFile(pilgrimId, type);

  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Length', String(file.size));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader(
    'Content-Disposition',
    contentDisposition('inline', file.originalName),
  );

  const fs = await import('fs');
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(file.absolutePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
};
