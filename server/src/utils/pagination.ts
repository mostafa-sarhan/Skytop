import { PaginatedResult } from '../types';

export const buildPage = <T>(items: T[], total: number, page: number, pageSize: number): PaginatedResult<T> => ({
  items,
  meta: {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  },
});
