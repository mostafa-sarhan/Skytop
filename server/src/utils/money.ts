import { Prisma } from '@prisma/client';

export const toDecimal = (value: string | number | Prisma.Decimal): Prisma.Decimal => {
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid decimal value');
    return new Prisma.Decimal(value.toFixed(2));
  }
  return new Prisma.Decimal(value);
};

export const decimalToJson = (value: Prisma.Decimal | string | null | undefined): string | null =>
  value === null || value === undefined ? null : toDecimal(value).toFixed(2);

