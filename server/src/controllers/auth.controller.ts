import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { clearAuthCookie, setAuthCookie } from '../middlewares/authenticate';
import { getActor } from '../utils/actor';
import { ok } from '../utils/http';

export const login = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username: string; password: string };
  const result = await authService.login(username, password);
  setAuthCookie(res, result.token);
  ok(res, result);
};

export const logout = (_req: Request, res: Response): void => {
  clearAuthCookie(res);
  ok(res, { loggedOut: true });
};

export const me = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const user = await authService.getMe(actor.id);
  ok(res, user);
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };
  await authService.changePassword(actor.id, currentPassword, newPassword);
  ok(res, { changed: true });
};
