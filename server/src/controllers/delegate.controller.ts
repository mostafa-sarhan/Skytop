import { Request, Response } from 'express';
import { getParams, getQuery } from '../middlewares/validate';
import * as delegateService from '../services/delegate.service';
import * as pilgrimService from '../services/pilgrim.service';
import { getActor } from '../utils/actor';
import { created, ok, paginated } from '../utils/http';
import { DelegateListQuery } from '../validators';

export const list = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<DelegateListQuery>(req);
  paginated(res, await delegateService.listDelegates(query));
};

export const getById = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  ok(res, await delegateService.getDelegateById(id));
};

export const trips = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  const { scope } = getQuery<{ scope: 'active' | 'all' }>(req);
  ok(res, await delegateService.listDelegateTrips(id, scope));
};

export const tripPilgrims = async (req: Request, res: Response): Promise<void> => {
  const { id, tripId } = getParams<{ id: string; tripId: string }>(req);
  const { status } = getQuery<{ status: 'ACTIVE' | 'CANCELLED' }>(req);
  ok(res, await pilgrimService.listDelegateTripPilgrims(id, tripId, status));
};

export const create = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  created(res, await delegateService.createDelegate(actor.id, req.body));
};

export const update = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const { id } = getParams<{ id: string }>(req);
  ok(res, await delegateService.updateDelegate(actor.id, id, req.body));
};

export const changeStatus = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const { id } = getParams<{ id: string }>(req);
  const { status } = req.body as { status: 'ACTIVE' | 'INACTIVE' };
  ok(res, await delegateService.changeDelegateStatus(actor.id, id, status));
};
