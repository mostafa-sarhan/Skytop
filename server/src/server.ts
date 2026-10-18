import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/database';

const start = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('database_connected', { url: env.DATABASE_URL.replace(/:[^:@]*@/, ':***@') });

    const app = createApp();
    const server = app.listen(env.PORT, () => {
      logger.info('server_started', {
        port: env.PORT,
        env: env.NODE_ENV,
        url: `http://localhost:${env.PORT}/api/v1`,
      });
    });

    const shutdown = (signal: string) => {
      logger.info('server_stopping', { signal });
      server.close(() => {
        void prisma.$disconnect().finally(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('unhandledRejection', (reason) => logger.error('unhandled_rejection', { reason }));
    process.on('uncaughtException', (error) => logger.error('uncaught_exception', { error }));
  } catch (error) {
    logger.error('server_start_failed', { error });
    process.exit(1);
  }
};

void start();
