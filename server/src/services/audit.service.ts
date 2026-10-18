import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { buildPage } from '../utils/pagination';

export interface AuditListQuery {
  page: number;
  pageSize: number;
  action?: string;
  entityType?: string;
}

export const listAuditLogs = async (query: AuditListQuery) => {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action as AuditAction } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
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

  return buildPage(rows, total, query.page, query.pageSize);
};

export const listAuditActions = async (): Promise<string[]> => {
  return Object.values(AuditAction);
};
