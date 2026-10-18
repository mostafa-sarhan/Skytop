import { Request, Response } from 'express';
import { getParams, getQuery } from '../middlewares/validate';
import * as tripService from '../services/trip.service';
import { getActor } from '../utils/actor';
import { created, ok, paginated } from '../utils/http';
import { TripListQuery } from '../validators';

export const list = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<TripListQuery>(req);
  paginated(res, await tripService.listTrips(query));
};

export const getById = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  ok(res, await tripService.getTripById(id));
};

export const create = async (req: Request, res: Response): Promise<void> => {
  created(res, await tripService.createTrip(req.body));
};

export const update = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  ok(res, await tripService.updateTrip(id, req.body));
};

export const assignDelegate = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  const { delegateId, pricePerPerson } = req.body as { delegateId: string; pricePerPerson: string };
  created(res, await tripService.assignDelegateToTrip(id, delegateId, pricePerPerson));
};

export const updateDelegatePrice = async (req: Request, res: Response): Promise<void> => {
  const actor = getActor(req);
  const { id, delegateId } = getParams<{ id: string; delegateId: string }>(req);
  const { pricePerPerson, reason } = req.body as { pricePerPerson: string; reason?: string };
  ok(res, await tripService.updateDelegatePrice(actor, id, delegateId, pricePerPerson, reason));
};

export const changeStatus = async (req: Request, res: Response): Promise<void> => {
  const { id } = getParams<{ id: string }>(req);
  const { status } = req.body as { status: 'OPEN' | 'CLOSED' | 'COMPLETED' };
  ok(res, await tripService.updateTrip(id, { status }));
};
