import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { getActor } from '../utils/actor';
import { ok } from '../utils/http';

export const overview = async (req: Request, res: Response): Promise<void> => {
  ok(res, await dashboardService.dashboardOverview(getActor(req).role));
};
