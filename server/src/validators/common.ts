import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { toWesternDigits } from '../utils/digits';

const DECIMAL_RE = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Money is exchanged as a decimal string. No floating point parsing happens
 * anywhere on the server; values become `Prisma.Decimal` immediately.
 */
export const money = (opts: { min?: number; max?: number } = {}) =>
  z
    .string()
    // "١٢٥٠٠" / "۱۲۵۰۰" → "12500" (character mapping only, before validation).
    .transform(toWesternDigits)
    .pipe(
      z
        .string()
        .trim()
        .regex(DECIMAL_RE, 'يجب إدخال مبلغ رقمي صحيح بحد أقصى خانتين عشريتين')
        .refine((v) => {
          // Zod still runs refinements after a failed regex: only range-check
          // valid decimals (the regex already reported the others).
          if (!DECIMAL_RE.test(v)) return true;
          const d = new Prisma.Decimal(v);
          if (opts.min !== undefined && d.lessThan(opts.min)) return false;
          if (opts.max !== undefined && d.greaterThan(opts.max)) return false;
          return true;
        }, 'قيمة المبلغ خارج النطاق المسموح')
        .transform((v) => new Prisma.Decimal(v).toFixed(2)),
    );

export const uuid = z.string().uuid('المعرّف غير صحيح');

export const uuidParam = z.object({ id: uuid });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  // Receipt / reference / passport numbers are stored with Western digits.
  search: z.string().trim().max(120).transform(toWesternDigits).optional(),
  sortBy: z.string().trim().max(40).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const reasonSchema = z
  .string()
  .trim()
  .min(3, 'يجب إدخال سبب لا يقل عن 3 أحرف')
  .max(500, 'السبب طويل جداً');

export const arabicName = z
  .string()
  .trim()
  .min(2, 'يجب إدخال الاسم')
  .max(160, 'الاسم طويل جداً');

export const phone = z
  .string()
  .trim()
  .regex(/^(\+?\d{1,4}[\s-]?)?(\d{7,15})$/, 'رقم الهاتف غير صحيح');

export const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} طويل جداً`).optional();

export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD')
  .transform((v) => new Date(`${v}T00:00:00.000Z`));

/** Transfer / reference numbers: free text, digits stored as Western digits. */
export const referenceText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} طويل جداً`).transform(toWesternDigits).optional();
