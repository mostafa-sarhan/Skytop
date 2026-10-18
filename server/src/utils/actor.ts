import { Role } from '@prisma/client';
import { Request } from 'express';
import { AuthUser } from '../types';
import { AppError } from './AppError';

export const getAuthUser = (req: Request): AuthUser => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};

export const getActor = (req: Request) => {
  const user = getAuthUser(req);
  return { id: user.id, role: user.role as Role, fullName: user.fullName, username: user.username };
};
