import { Request, Response } from 'express';
import fs from 'fs';
import { getParams, getQuery } from '../middlewares/validate';
import * as expenseService from '../services/expense.service';
import { getActor } from '../utils/actor';
import { contentDisposition } from '../utils/contentDisposition';
import { created, ok, paginated } from '../utils/http';
import { CreateExpenseInput, ExpenseListQuery } from '../validators';

export const list = async (req: Request, res: Response): Promise<void> => {
  paginated(res, await expenseService.listExpenses(getQuery<ExpenseListQuery>(req), getActor(req).role));
};

export const summary = async (req: Request, res: Response): Promise<void> => {
  ok(res, await expenseService.expenseSummary(getActor(req).role));
};

export const getById = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  ok(res, await expenseService.getExpense(id, getActor(req).role));
};

export const create = async (req: Request, res: Response): Promise<void> => {
  created(res, await expenseService.createExpense(getActor(req), req.body as CreateExpenseInput, req.file));
};

export const voidExpense = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  const { reason } = req.body as { reason: string };
  ok(res, await expenseService.voidExpense(getActor(req), id, reason));
};

export const attachment = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  const file = await expenseService.getExpenseAttachment(id);
  res.setHeader('Content-Type', file.mime);
  if (file.size !== undefined) res.setHeader('Content-Length', String(file.size));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', contentDisposition('inline', file.originalName));
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(file.absolutePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
};
