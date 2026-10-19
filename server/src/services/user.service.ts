import { Prisma, Role } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../utils/audit';
import { buildPage } from '../utils/pagination';
import { hashPassword } from './auth.service';
import { withTransaction } from '../utils/transaction';
import { usernameProblems } from '../utils/credentials';

const userSelect = {
  id: true,
  fullName: true,
  username: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  passwordResetAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export interface ListUsersQuery {
  page: number;
  pageSize: number;
  search?: string;
  role?: Role;
}

export const listUsers = async (query: ListUsersQuery) => {
  const where: Prisma.UserWhereInput = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' } },
            { username: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return buildPage(items, total, query.page, query.pageSize);
};

export const createUser = async (actorId: string, input: {
  fullName: string;
  username: string;
  password: string;
  role: Role;
}) => {
  const username = input.username.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw AppError.conflict('اسم المستخدم مستخدم بالفعل');

  const passwordHash = await hashPassword(input.password);

  return withTransaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        fullName: input.fullName,
        username,
        passwordHash,
        role: input.role,
        mustChangePassword: true,
      },
      select: userSelect,
    });

    await writeAuditLog(
      {
        userId: actorId,
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: user.id,
        newData: { username: user.username, role: user.role, fullName: user.fullName },
      },
      tx,
    );

    return user;
  });
};

export const updateUser = async (
  actorId: string,
  userId: string,
  input: { fullName?: string; username?: string; role?: Role; isActive?: boolean },
) => {
  if (actorId === userId && (input.isActive === false || input.role)) {
    throw AppError.badRequest('لا يمكنك تعديل صلاحيات حسابك الحالي');
  }

  return withTransaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: userId }, select: userSelect });
    if (!current) throw AppError.notFound('الحساب غير موجود');

    // A NEW username must follow the policy (≥ 6, allowed characters); an
    // unchanged legacy short username is simply kept.
    const renaming = input.username !== undefined && input.username !== current.username;
    if (renaming) {
      const problems = usernameProblems(input.username!);
      if (problems.length) {
        throw AppError.unprocessable(
          'بيانات الإدخال غير صحيحة',
          problems.map((message) => ({ field: 'username', message })),
        );
      }
      const taken = await tx.user.findUnique({ where: { username: input.username }, select: { id: true } });
      if (taken) throw AppError.conflict('اسم المستخدم مستخدم بالفعل', { field: 'username' });
    }
    const deactivating = input.isActive === false && current.isActive;

    const user = await tx.user.update({
      where: { id: userId },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(renaming ? { username: input.username } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        // Deactivation ends every open session; reactivating later does not
        // bring old tokens back.
        ...(deactivating ? { sessionVersion: { increment: 1 } } : {}),
      },
      select: userSelect,
    });

    if (renaming) {
      await writeAuditLog(
        {
          userId: actorId,
          action: 'USERNAME_CHANGED',
          entityType: 'User',
          entityId: userId,
          oldData: { username: current.username },
          newData: { username: user.username },
        },
        tx,
      );
    }

    // Status and role are audited independently (both may change at once).
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      await writeAuditLog(
        {
          userId: actorId,
          action: input.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          entityType: 'User',
          entityId: userId,
          oldData: { isActive: current.isActive },
          newData: { isActive: input.isActive },
        },
        tx,
      );
    }
    if (input.role && input.role !== current.role) {
      await writeAuditLog(
        {
          userId: actorId,
          action: 'USER_ROLE_CHANGED',
          entityType: 'User',
          entityId: userId,
          oldData: { role: current.role, username: current.username },
          newData: { role: input.role, username: current.username },
        },
        tx,
      );
    }

    return user;
  });
};

export const resetPassword = async (
  actorId: string,
  userId: string,
  newPassword: string,
) => {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw AppError.notFound('الحساب غير موجود');

  const passwordHash = await hashPassword(newPassword);

  await withTransaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      // New password: every existing session of this account ends.
      data: { passwordHash, mustChangePassword: true, passwordResetAt: new Date(), sessionVersion: { increment: 1 } },
    });

    await writeAuditLog(
      {
        userId: actorId,
        action: 'PASSWORD_RESET',
        entityType: 'User',
        entityId: userId,
        // Never store passwords, hashes or tokens in the audit trail.
        newData: { username: target.username, resetBy: actorId },
      },
      tx,
    );
  });
};
