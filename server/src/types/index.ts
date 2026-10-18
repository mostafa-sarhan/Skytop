import { Role } from '@prisma/client';

export type { Role };

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
