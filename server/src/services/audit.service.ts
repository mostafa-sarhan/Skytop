import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { formatMoney } from '../modules/pdf/format';
import { buildPage } from '../utils/pagination';

export interface AuditListQuery {
  page: number;
  pageSize: number;
  search?: string;
  action?: string;
  entityType?: string;
}

/** Human reference shown instead of the raw id (manager-only audit page). */
export interface AuditReference {
  title: string;
  subtitle?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (value: Prisma.Decimal | string | number) => `${formatMoney(String(value))} جنيه`;
const EXPENSE_CATEGORY: Record<string, string> = {
  ELECTRICITY: 'كهرباء',
  INTERNET: 'إنترنت',
  RENT: 'إيجار',
  OFFICE_SUPPLIES: 'أدوات مكتبية',
  MAINTENANCE: 'صيانة',
  TRANSPORTATION: 'نقل',
  HOSPITALITY: 'ضيافة',
  OTHER: 'أخرى',
};

/**
 * Resolves readable references for a page of audit rows with at most one
 * query per entity type (no per-row queries). Records that no longer exist
 * fall back to names stored in the audit data itself.
 */
const resolveReferences = async (rows: Array<{ entityType: string; entityId: string }>) => {
  const idsOf = (type: string) => [...new Set(rows.filter((r) => r.entityType === type).map((r) => r.entityId))];
  const [payments, expenses, adjustments, pilgrims, trips, delegates, users, assignments] = await Promise.all([
    idsOf('Payment').length
      ? prisma.payment.findMany({ where: { id: { in: idsOf('Payment') } }, select: { id: true, receiptNumber: true, legacyReceiptNumber: true, amount: true, delegate: { select: { name: true } } } })
      : [],
    idsOf('Expense').length
      ? prisma.expense.findMany({ where: { id: { in: idsOf('Expense') } }, select: { id: true, description: true, amount: true, category: true } })
      : [],
    idsOf('FinancialAdjustment').length
      ? prisma.financialAdjustment.findMany({ where: { id: { in: idsOf('FinancialAdjustment') } }, select: { id: true, type: true, direction: true, amount: true, delegate: { select: { name: true } } } })
      : [],
    idsOf('Pilgrim').length
      ? prisma.pilgrim.findMany({ where: { id: { in: idsOf('Pilgrim') } }, select: { id: true, name: true, passportNumber: true, trip: { select: { name: true } } } })
      : [],
    idsOf('Trip').length ? prisma.trip.findMany({ where: { id: { in: idsOf('Trip') } }, select: { id: true, name: true } }) : [],
    idsOf('Delegate').length ? prisma.delegate.findMany({ where: { id: { in: idsOf('Delegate') } }, select: { id: true, name: true, phone: true } }) : [],
    idsOf('User').length ? prisma.user.findMany({ where: { id: { in: idsOf('User') } }, select: { id: true, fullName: true, username: true } }) : [],
    idsOf('DelegateTrip').length
      ? prisma.delegateTrip.findMany({ where: { id: { in: idsOf('DelegateTrip') } }, select: { id: true, delegate: { select: { name: true } }, trip: { select: { name: true } } } })
      : [],
  ]);

  const refs = new Map<string, AuditReference>();
  for (const p of payments) {
    refs.set(p.id, {
      title: `إيصال رقم ${p.receiptNumber ?? p.legacyReceiptNumber ?? '—'} — ${money(p.amount)}`,
      subtitle: `المندوب: ${p.delegate.name}`,
    });
  }
  for (const e of expenses) refs.set(e.id, { title: e.description, subtitle: `${EXPENSE_CATEGORY[e.category] ?? ''} — ${money(e.amount)}` });
  for (const a of adjustments) {
    const kind = a.type === 'REFUND' ? 'استرداد للمندوب' : a.direction === 'INCREASE' ? 'تسوية: إضافة على الحساب' : 'تسوية: خصم من الحساب';
    refs.set(a.id, { title: `${kind} — ${money(a.amount)}`, subtitle: `المندوب: ${a.delegate.name}` });
  }
  for (const p of pilgrims) refs.set(p.id, { title: p.name, subtitle: `${p.trip.name} — جواز ${p.passportNumber}` });
  for (const t of trips) refs.set(t.id, { title: t.name });
  for (const d of delegates) refs.set(d.id, { title: d.name, subtitle: d.phone });
  for (const u of users) refs.set(u.id, { title: u.fullName, subtitle: u.username });
  for (const a of assignments) refs.set(a.id, { title: `${a.delegate.name} — ${a.trip.name}`, subtitle: 'سعر الفرد للمندوب في الرحلة' });
  return refs;
};

/** Names recorded in the audit data, used when the record itself is gone. */
const fallbackReference = (oldData: unknown, newData: unknown): AuditReference | null => {
  const data = { ...(oldData as Record<string, unknown> | null), ...(newData as Record<string, unknown> | null) };
  const name = data.pilgrimName ?? data.description ?? data.delegateName ?? data.tripName ?? data.fullName ?? data.name;
  return typeof name === 'string' ? { title: name } : null;
};

export const listAuditLogs = async (query: AuditListQuery) => {
  const search = query.search?.trim();
  // Search: an id matches exactly; other text is looked up in the recorded
  // audit data (names, receipt numbers, reasons) — a small raw query.
  const searchIds =
    search && !UUID_RE.test(search)
      ? (
          await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "AuditLog"
            WHERE coalesce("oldData"::text, '') ILIKE ${`%${search}%`} OR coalesce("newData"::text, '') ILIKE ${`%${search}%`}
            LIMIT 5000`
        ).map((r) => r.id)
      : null;
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action as AuditAction } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(search ? (UUID_RE.test(search) ? { entityId: search } : { id: { in: searchIds ?? [] } }) : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, username: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const refs = await resolveReferences(rows);
  const items = rows.map((row) => ({
    ...row,
    reference: refs.get(row.entityId) ?? fallbackReference(row.oldData, row.newData),
  }));
  return buildPage(items, total, query.page, query.pageSize);
};

export const listAuditActions = async (): Promise<string[]> => {
  return Object.values(AuditAction);
};
