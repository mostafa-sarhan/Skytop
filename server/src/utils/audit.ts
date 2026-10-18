import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { TransactionClient } from './transaction';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'jwtsecret',
]);

/** Recursively strips anything that must never reach the audit trail. */
export const sanitizeForAudit = (value: unknown, depth = 0): unknown => {
  if (depth > 6 || value === null || value === undefined) return value ?? null;
  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeForAudit(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
      out[key] = sanitizeForAudit(val, depth + 1);
    }
    return out;
  }
  return value;
};

export interface AuditInput {
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldData?: unknown;
  newData?: unknown;
}

export async function writeAuditLog(
  input: AuditInput,
  tx?: TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldData: sanitizeForAudit(input.oldData) as Prisma.InputJsonValue,
      newData: sanitizeForAudit(input.newData) as Prisma.InputJsonValue,
    },
  });
}
