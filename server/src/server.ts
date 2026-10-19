import type { Server } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { isShuttingDown, markShuttingDown } from './config/lifecycle';

/** How long in-flight requests get to finish before the process exits anyway. */
const SHUTDOWN_GRACE_MS = 10_000;

/** host:port/database only — never the user or password. */
const describeDatabase = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return 'unparseable';
  }
};

const start = async (): Promise<void> => {
  let server: Server | undefined;

  /**
   * SIGTERM (systemd stop / restart) or SIGINT: stop accepting connections,
   * report 503 on health checks, let in-flight requests finish, close idle
   * keep-alive sockets, disconnect Prisma, exit. Forced exit after the grace
   * period so a restart can never hang.
   */
  const shutdown = (reason: string, exitCode = 0) => {
    if (isShuttingDown()) return;
    markShuttingDown();
    logger.info('server_stopping', { reason });
    setTimeout(() => {
      logger.error('server_stop_forced', { afterMs: SHUTDOWN_GRACE_MS });
      server?.closeAllConnections();
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
    const finish = () =>
      void prisma
        .$disconnect()
        .catch((error: unknown) => logger.error('prisma_disconnect_failed', { error }))
        .finally(() => {
          logger.info('server_stopped');
          process.exit(exitCode);
        });
    if (!server) return finish();
    server.close(() => finish());
    server.closeIdleConnections();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error('unhandled_rejection', { reason }));
  // State is unknown after an uncaught exception: log, stop cleanly, and let
  // the process manager (systemd) start a fresh process.
  process.on('uncaughtException', (error) => {
    logger.error('uncaught_exception', { error });
    shutdown('uncaughtException', 1);
  });

  try {
    await prisma.$connect();
    logger.info('database_connected', { database: describeDatabase(env.DATABASE_URL) });

    const app = createApp();
    server = app.listen(env.PORT, env.HOST, () => {
      logger.info('server_started', { host: env.HOST, port: env.PORT, env: env.NODE_ENV });
    });
    // Longer than Nginx's upstream keep-alive so Node never closes a socket
    // Nginx is about to reuse.
    server.keepAliveTimeout = 65_000;
    server.headersTimeout = 66_000;
    server.requestTimeout = 120_000;
  } catch (error) {
    logger.error('server_start_failed', { error });
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  }
};

void start();
