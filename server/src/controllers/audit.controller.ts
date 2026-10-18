import { Request, Response } from 'express';
import * as auditService from '../services/audit.service';
import { getQuery } from '../middlewares/validate';
import { ok, paginated } from '../utils/http';
import { AuditListQuery } from '../validators';

export const list = async (req: Request, res: Response): Promise<void> => {
  const query = getQuery<AuditListQuery>(req);
  paginated(res, await auditService.listAuditLogs(query));
};

export const actions = async (_req: Request, res: Response): Promise<void> => {
  ok(res, { actions: await auditService.listAuditActions() });
};
