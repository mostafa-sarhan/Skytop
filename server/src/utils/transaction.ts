import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export type TransactionClient = Prisma.TransactionClient;

/**
 * Runs `fn` inside a database transaction and retries on write conflicts /
 * deadlocks (40001 / 40P01) a bounded number of times.
 */
export async function withTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
  options: { maxRetries?: number } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await prisma.$transaction(
        async (tx) => fn(tx),
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 },
      );
    } catch (error) {
      attempt += 1;
      const code = (error as { code?: string }).code;
      const retryable = code === 'P2034' || code === '40001' || code === '40P01';
      if (!retryable || attempt > maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
    }
  }
}
