import crypto from 'crypto';
import { ExpenseCategory, PaymentMethod, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/database';
import { removeQuietly, resolveStoredFile, storePrivateFile, UploadedFile } from '../modules/documents/storage';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../utils/audit';
import { dateRangeFilter } from '../utils/dateRange';
import { decimalToJson } from '../utils/money';
import { buildPage } from '../utils/pagination';
import { withTransaction } from '../utils/transaction';
import { CreateExpenseInput } from '../validators';

/*
 * Company expenses: the company's own operating costs. This module never reads
 * or writes delegate accounts, payments, pilgrims or trips.
 */

const ATTACHMENT_FOLDER = 'expenses';

interface Actor {
  id: string;
  role: Role;
}

export interface ExpenseFilters {
  search?: string;
  category?: ExpenseCategory;
  paymentMethod?: PaymentMethod;
  from?: Date;
  to?: Date;
}

/** One place for the filter rules, so the list and the exports always match. */
export const expenseWhere = (
  filters: ExpenseFilters,
  status?: 'ACTIVE' | 'VOIDED',
): Prisma.ExpenseWhereInput => ({
  ...(status ? { status } : {}),
  ...(filters.category ? { category: filters.category } : {}),
  ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
  ...(filters.from || filters.to ? { expenseDate: dateRangeFilter(filters.from, filters.to) } : {}),
  ...(filters.search
    ? {
        OR: [
          { description: { contains: filters.search, mode: 'insensitive' } },
          { referenceNumber: { contains: filters.search, mode: 'insensitive' } },
          { notes: { contains: filters.search, mode: 'insensitive' } },
        ],
      }
    : {}),
});

const expenseInclude = {
  createdBy: { select: { id: true, fullName: true } },
  voidedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

/**
 * Public shape. Never exposes the storage key. Who voided an expense, when and
 * why is manager-only (employees still see status VOIDED).
 */
export const serializeExpense = (e: ExpenseRow, role: Role) => ({
  id: e.id,
  category: e.category,
  amount: decimalToJson(e.amount)!,
  expenseDate: e.expenseDate.toISOString(),
  paymentMethod: e.paymentMethod,
  transferType: e.transferType,
  referenceNumber: e.referenceNumber,
  description: e.description,
  notes: e.notes,
  hasAttachment: Boolean(e.attachmentKey),
  attachmentOriginalName: e.attachmentOriginalName,
  attachmentMimeType: e.attachmentMimeType,
  attachmentSizeBytes: e.attachmentSizeBytes,
  status: e.status,
  createdBy: e.createdBy,
  createdAt: e.createdAt.toISOString(),
  ...(role === 'MANAGER'
    ? { voidedBy: e.voidedBy, voidedAt: e.voidedAt ? e.voidedAt.toISOString() : null, voidReason: e.voidReason }
    : { voidedBy: null, voidedAt: null, voidReason: null }),
});

/** First day of this month and of next month (UTC dates, like expenseDate). */
const currentMonthRange = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, next };
};

const sumOf = (agg: { _sum: { amount: Prisma.Decimal | null } }) =>
  decimalToJson(agg._sum.amount ?? new Prisma.Decimal(0))!;

/**
 * Company-wide summary (ACTIVE only — voided expenses never count). Managers
 * also get this month's totals per category.
 */
export const expenseSummary = async (role: Role) => {
  const { start, next } = currentMonthRange();
  const monthWhere: Prisma.ExpenseWhereInput = { status: 'ACTIVE', expenseDate: { gte: start, lt: next } };
  const [all, month, byCategory] = await Promise.all([
    prisma.expense.aggregate({ where: { status: 'ACTIVE' }, _sum: { amount: true }, _count: true }),
    prisma.expense.aggregate({ where: monthWhere, _sum: { amount: true }, _count: true }),
    role === 'MANAGER'
      ? prisma.expense.groupBy({ by: ['category'], where: monthWhere, _sum: { amount: true } })
      : Promise.resolve(null),
  ]);
  return {
    totalActive: sumOf(all),
    activeCount: all._count,
    monthTotal: sumOf(month),
    monthCount: month._count,
    monthByCategory:
      byCategory
        ?.map((row) => ({ category: row.category, total: sumOf(row) }))
        .sort((a, b) => Number(b.total) - Number(a.total)) ?? null,
  };
};

export const listExpenses = async (
  query: ExpenseFilters & { page: number; pageSize: number; status?: 'ACTIVE' | 'VOIDED' },
  role: Role,
) => {
  const where = expenseWhere(query, query.status);
  const [rows, total, filteredActive] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: expenseInclude,
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.expense.count({ where }),
    // Total of the filtered list — ACTIVE rows only, computed in the database.
    query.status === 'VOIDED'
      ? Promise.resolve(null)
      : prisma.expense.aggregate({ where: expenseWhere(query, 'ACTIVE'), _sum: { amount: true }, _count: true }),
  ]);
  return {
    ...buildPage(
      rows.map((row) => serializeExpense(row, role)),
      total,
      query.page,
      query.pageSize,
    ),
    filtered: {
      activeCount: filteredActive?._count ?? 0,
      activeTotal: filteredActive ? sumOf(filteredActive) : '0.00',
    },
  };
};

export const getExpense = async (id: string, role: Role) => {
  const row = await prisma.expense.findUnique({ where: { id }, include: expenseInclude });
  if (!row) throw AppError.notFound('المصروف غير موجود');
  return serializeExpense(row, role);
};

/**
 * Records an expense (any authenticated role). The optional invoice / receipt
 * is validated and written to private storage first; if the database write
 * fails the file is removed again.
 */
export const createExpense = async (actor: Actor, input: CreateExpenseInput, attachment?: UploadedFile) => {
  const id = crypto.randomUUID();
  const transfer = input.paymentMethod === 'TRANSFER';
  const attachmentKey = attachment ? await storePrivateFile(ATTACHMENT_FOLDER, id, 'INVOICE', attachment) : null;

  try {
    const row = await withTransaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          id,
          category: input.category,
          amount: input.amount,
          expenseDate: input.expenseDate,
          paymentMethod: input.paymentMethod,
          transferType: transfer ? input.transferType : null,
          referenceNumber: transfer ? (input.referenceNumber || null) : null,
          description: input.description,
          notes: input.notes || null,
          attachmentKey,
          attachmentOriginalName: attachment ? attachment.originalname.slice(0, 255) : null,
          attachmentMimeType: attachment ? attachment.mimetype : null,
          attachmentSizeBytes: attachment ? attachment.size : null,
          createdById: actor.id,
        },
        include: expenseInclude,
      });
      await writeAuditLog(
        {
          userId: actor.id,
          action: 'EXPENSE_CREATED',
          entityType: 'Expense',
          entityId: id,
          newData: {
            category: created.category,
            amount: decimalToJson(created.amount),
            expenseDate: created.expenseDate.toISOString().slice(0, 10),
            paymentMethod: created.paymentMethod,
            hasAttachment: Boolean(attachmentKey),
          },
        },
        tx,
      );
      return created;
    });
    return serializeExpense(row, actor.role);
  } catch (error) {
    if (attachmentKey) await removeQuietly(attachmentKey);
    throw error;
  }
};

/**
 * Manager-only exceptional correction. The expense stays in history (with its
 * attachment) as VOIDED, which alone removes it from every active total.
 */
export const voidExpense = async (actor: Actor, id: string, reason: string) => {
  if (actor.role !== 'MANAGER') throw AppError.forbidden();
  return withTransaction(async (tx) => {
    const expense = await tx.expense.findUnique({ where: { id } });
    if (!expense) throw AppError.notFound('المصروف غير موجود');
    // Conditional flip: two concurrent voids cannot both succeed.
    const flipped = await tx.expense.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'VOIDED', voidedById: actor.id, voidedAt: new Date(), voidReason: reason },
    });
    if (flipped.count === 0) throw AppError.badRequest('المصروف ملغى مسبقاً');
    await writeAuditLog(
      {
        userId: actor.id,
        action: 'EXPENSE_VOIDED',
        entityType: 'Expense',
        entityId: id,
        oldData: {
          status: expense.status,
          category: expense.category,
          amount: decimalToJson(expense.amount),
          expenseDate: expense.expenseDate.toISOString().slice(0, 10),
          description: expense.description,
        },
        newData: { status: 'VOIDED', reason },
      },
      tx,
    );
    const updated = await tx.expense.findUniqueOrThrow({ where: { id }, include: expenseInclude });
    return serializeExpense(updated, actor.role);
  });
};

/** Authenticated access to the stored invoice / receipt. */
export const getExpenseAttachment = async (id: string) => {
  const expense = await prisma.expense.findUnique({
    where: { id },
    select: { attachmentKey: true, attachmentMimeType: true, attachmentOriginalName: true, attachmentSizeBytes: true },
  });
  if (!expense) throw AppError.notFound('المصروف غير موجود');
  if (!expense.attachmentKey) throw AppError.notFound('لا توجد فاتورة أو إيصال مرفق بهذا المصروف');
  return {
    absolutePath: await resolveStoredFile(expense.attachmentKey),
    mime: expense.attachmentMimeType ?? 'application/octet-stream',
    originalName: expense.attachmentOriginalName ?? `expense-${id}`,
    size: expense.attachmentSizeBytes ?? undefined,
  };
};

/** Rows + totals for the PDF / Excel export (same filters as the list). */
export const expenseReport = async (filters: ExpenseFilters & { includeVoided: boolean }) => {
  const where = expenseWhere(filters, filters.includeVoided ? undefined : 'ACTIVE');
  const [rows, active] = await Promise.all([
    prisma.expense.findMany({
      where,
      select: {
        expenseDate: true,
        category: true,
        description: true,
        amount: true,
        paymentMethod: true,
        transferType: true,
        referenceNumber: true,
        status: true,
        createdBy: { select: { fullName: true } },
      },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.expense.aggregate({ where: expenseWhere(filters, 'ACTIVE'), _sum: { amount: true }, _count: true }),
  ]);
  return {
    rows: rows.map((r, index) => ({
      index: index + 1,
      expenseDate: r.expenseDate.toISOString().slice(0, 10),
      category: r.category,
      description: r.description,
      amount: decimalToJson(r.amount)!,
      paymentMethod: r.paymentMethod,
      transferType: r.transferType,
      referenceNumber: r.referenceNumber ?? '',
      status: r.status,
      createdBy: r.createdBy.fullName,
    })),
    summary: { activeCount: active._count, activeTotal: sumOf(active), rowCount: rows.length },
  };
};
