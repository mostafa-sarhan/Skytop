import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { getParams, getQuery } from '../middlewares/validate';
import * as movementService from '../services/financialMovements.service';
import * as paymentService from '../services/payment.service';
import * as accountService from '../services/delegateAccount.service';
import { getActor } from '../utils/actor';
import { created, ok, paginated } from '../utils/http';
import { contentDisposition } from '../utils/contentDisposition';
import {
  AdjustmentListQuery,
  DelegateAccountsQuery,
  MovementListQuery,
  PaymentListQuery,
} from '../validators';

export const list = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<PaymentListQuery>(req);
  const { role } = getActor(req);
  const page = await paymentService.listPayments(query);
  paginated(res, { ...page, items: page.items.map((row) => accountService.paymentRowForRole(row, role)) });
};

export const getById = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  ok(res, accountService.paymentRowForRole(await paymentService.getPaymentById(id), getActor(req).role));
};

export const create = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  created(res, await paymentService.createPayment(actor, req.body, req.file));
};

export const receiptScan = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  const file = await paymentService.getPaymentReceiptScan(id);

  res.setHeader('Content-Type', file.mime);
  if (file.size !== undefined) res.setHeader('Content-Length', String(file.size));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', contentDisposition('inline', file.originalName));

  const fs = await import('fs');
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(file.absolutePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
};

export const voidPayment = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const { id } = getParams<{ id: string }>(req);
  const { reason } = req.body as { reason: string };
  ok(res, await paymentService.voidPayment(actor, id, reason));
};

export const movements = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<MovementListQuery>(req);
  paginated(res, await movementService.listFinancialMovements(query));
};

export const delegateAccounts = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<DelegateAccountsQuery>(req);
  paginated(res, await accountService.listDelegateAccounts(query));
};

export const balance = async (req: Request, res: Response): Promise<void> => {
  const { delegateId } = getParams<{ delegateId: string }>(req);
  ok(res, await accountService.getDelegateAccount(delegateId));
};

export const statement = async (req: Request, res: Response): Promise<void> => {
  const { delegateId } = getParams<{ delegateId: string }>(req);
  const actor = getActor(req);
  const statement = await accountService.getDelegateAccountStatement(delegateId, {
    includeAdjustments: actor.role === 'MANAGER',
  });
  ok(res, {
    ...statement,
    payments: statement.payments.map((row) => accountService.paymentRowForRole(row, actor.role)),
  });
};

export const refund = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  created(res, await paymentService.createRefund(actor, req.body));
};

export const correction = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  created(res, await paymentService.createCorrection(actor, req.body));
};

export const listAdjustments = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<AdjustmentListQuery>(req);
  const where = query.delegateId ? { delegateId: query.delegateId } : {};

  const [rows, total] = await Promise.all([
    prisma.financialAdjustment.findMany({
      where,
      include: {
        delegate: { select: { id: true, name: true } },
        performedBy: { select: { id: true, fullName: true } },
        relatedPayment: {
          select: { id: true, receiptNumber: true, legacyReceiptNumber: true, amount: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.financialAdjustment.count({ where }),
  ]);

  paginated(res, {
    items: rows.map((row) => ({
      ...row,
      effect: accountService.adjustmentEffect(row),
      effectiveDate: row.effectiveDate.toISOString(),
      amount: row.amount.toFixed(2),
      relatedPayment: row.relatedPayment
        ? { ...row.relatedPayment, amount: row.relatedPayment.amount.toFixed(2) }
        : null,
    })),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  });
};
