import { Router } from 'express';
import { prisma } from '../config/database';
import { isShuttingDown } from '../config/lifecycle';
import { logger } from '../config/logger';

const router = Router();
const DB_TIMEOUT_MS = 3000;

/** Liveness: the API process is up (no dependencies checked). */
router.get('/live', (_req, res) => {
  res.status(isShuttingDown() ? 503 : 200).json({ success: !isShuttingDown(), data: { status: isShuttingDown() ? 'stopping' : 'ok' } });
});

/**
 * Readiness: the API can serve requests, i.e. PostgreSQL answers within
 * 3 s. 503 while the database is unreachable or the process is stopping.
 * Never exposes configuration, versions or connection details.
 */
router.get('/', async (_req, res) => {
  if (isShuttingDown()) {
    res.status(503).json({ success: false, data: { status: 'stopping' } });
    return;
  }
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('database health check timed out')), DB_TIMEOUT_MS);
      }),
    ]);
    res.json({ success: true, data: { status: 'ok', database: 'ok', uptimeSeconds: Math.round(process.uptime()) } });
  } catch (error) {
    logger.error('health_database_unavailable', { error });
    res.status(503).json({ success: false, data: { status: 'unavailable', database: 'unreachable' } });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
