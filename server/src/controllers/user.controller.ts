import { Role } from '@prisma/client';
import { Request, Response } from 'express';
import { getParams, getQuery } from '../middlewares/validate';
import * as userService from '../services/user.service';
import { getActor } from '../utils/actor';
import { created, ok, paginated } from '../utils/http';
import { ListUsersQuery } from '../validators';

export const list = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<ListUsersQuery>(req);
  const page = await userService.listUsers(query);
  paginated(res, page);
};

export const create = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const user = await userService.createUser(actor.id, req.body);
  created(res, user);
};

export const update = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const { id } = getParams<{ id: string }>(req);
  const user = await userService.updateUser(actor.id, id, req.body);
  ok(res, user);
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const { id } = getParams<{ id: string }>(req);
  const { newPassword } = req.body as { newPassword: string };
  await userService.resetPassword(actor.id, id, newPassword);
  ok(res, { reset: true });
};

export const roles = (_req: Request, res: Response): void => {
  ok(res, { roles: Object.values(Role) });
};
