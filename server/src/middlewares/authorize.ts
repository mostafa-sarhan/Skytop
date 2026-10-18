import { NextFunction, Request, RequestHandler, Response } from 'express';
import { Role } from '@prisma/client';
import { AppError } from '../utils/AppError';

/**
 * Reusable role guard. Compose after `authenticate`.
 * The backend is the single source of truth for authorization.
 */
export const authorize =
  (...allowedRoles: Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      next(AppError.unauthorized());
      return;
    }
    if (allowedRoles.length === 0 || allowedRoles.includes(user.role)) {
      next();
      return;
    }
    next(AppError.forbidden());
  };
