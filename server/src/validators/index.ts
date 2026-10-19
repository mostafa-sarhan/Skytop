import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  DelegateStatus,
  ExpenseCategory,
  FinancialAdjustmentType,
  FlightType,
  PaymentMethod,
  Role,
  TripStatus,
  TransferType,
} from '@prisma/client';
import {
  arabicName,
  dateOnly,
  money,
  optionalText,
  paginationQuery,
  phone,
  referenceText,
  reasonSchema,
  uuid,
  uuidParam,
} from './common';
import { normalizeReceiptNumber } from '../utils/receiptNumber';
import { passwordProblems, usernameProblems } from '../utils/credentials';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

// Login accepts any existing account: legacy short usernames and passwords
// created before the current policy keep working (only NEW credentials are
// checked against utils/credentials).
export const loginSchema = z
  .object({
    username: z.string().trim().min(1, 'يجب إدخال اسم المستخدم').max(80),
    password: z.string().min(1, 'يجب إدخال كلمة المرور').max(200),
  })
  .strict();

/** A new password (create / reset / change): see utils/credentials. */
const newPassword = (field = 'كلمة المرور') =>
  z
    .string({ required_error: `يجب إدخال ${field}` })
    .max(200, 'كلمة المرور طويلة جداً')
    .superRefine((value, ctx) => {
      for (const message of passwordProblems(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'يجب إدخال كلمة المرور الحالية').max(200),
    newPassword: newPassword('كلمة المرور الجديدة'),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    newPassword: newPassword('كلمة المرور الجديدة'),
    mustChangePassword: z.boolean().default(true),
  })
  .strict();

// ---------------------------------------------------------------------------
// Users (manager only)
// ---------------------------------------------------------------------------

/** A NEW login name (existing short usernames are kept and still log in). */
const newUsername = z
  .string({ required_error: 'يجب إدخال اسم المستخدم' })
  .trim()
  .transform((value) => value.toLowerCase())
  .superRefine((value, ctx) => {
    for (const message of usernameProblems(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });

export const createUserSchema = z
  .object({
    fullName: arabicName,
    username: newUsername,
    password: newPassword(),
    role: z.nativeEnum(Role),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.username.length >= 3 && value.password.toLowerCase().includes(value.username)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'كلمة المرور يجب ألا تحتوي على اسم المستخدم' });
    }
  });

export const updateUserSchema = z
  .object({
    fullName: arabicName.optional(),
    // Optional rename. The username policy applies only when the value
    // actually changes (checked in the service): an unchanged legacy short
    // username can be sent back as-is.
    username: z
      .string()
      .trim()
      .max(80)
      .transform((value) => value.toLowerCase())
      .optional(),
    role: z.nativeEnum(Role).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'لا توجد بيانات للتعديل');

export const usersListQuery = paginationQuery.extend({
  role: z.nativeEnum(Role).optional(),
});

export type ListUsersQuery = z.infer<typeof usersListQuery>;
export type DelegateListQuery = z.infer<typeof delegateListQuery>;
export type DelegateAccountsQuery = z.infer<typeof delegateAccountsQuery>;
export type TripListQuery = z.infer<typeof tripListQuery>;
export type PilgrimListQuery = z.infer<typeof pilgrimListQuery>;
export type MovementListQuery = z.infer<typeof movementListQuery>;
export type PaymentListQuery = z.infer<typeof paymentListQuery>;
export type AuditListQuery = z.infer<typeof auditListQuery>;

// ---------------------------------------------------------------------------
// Delegates
// ---------------------------------------------------------------------------

export const createDelegateSchema = z
  .object({
    name: arabicName,
    phone: phone,
    address: z.string().trim().min(2, 'يجب إدخال العنوان').max(255),
    notes: optionalText(1000, 'الملاحظات'),
  })
  .strict();

export const updateDelegateSchema = z
  .object({
    name: arabicName.optional(),
    phone: phone.optional(),
    address: z.string().trim().min(2).max(255).optional(),
    notes: optionalText(1000, 'الملاحظات'),
    status: z.nativeEnum(DelegateStatus).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'لا توجد بيانات للتعديل');

export const delegateListQuery = paginationQuery.extend({
  status: z.nativeEnum(DelegateStatus).optional(),
});

export const delegateAccountsQuery = paginationQuery.extend({
  accountStatus: z.enum(['DUE', 'SETTLED', 'CREDIT']).optional(),
});

export const delegateTripsQuery = z.object({
  scope: z.enum(['active', 'all']).default('active'),
});

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

export const createTripSchema = z
  .object({
    name: arabicName,
    departureDate: dateOnly,
    returnDate: dateOnly,
    flightType: z.nativeEnum(FlightType),
    status: z.nativeEnum(TripStatus).default(TripStatus.OPEN),
  })
  .strict()
  .refine((v) => v.returnDate >= v.departureDate, {
    message: 'تاريخ العودة لا يمكن أن يكون قبل تاريخ السفر',
    path: ['returnDate'],
  });

export const updateTripSchema = z
  .object({
    name: arabicName.optional(),
    departureDate: dateOnly.optional(),
    returnDate: dateOnly.optional(),
    flightType: z.nativeEnum(FlightType).optional(),
    status: z.nativeEnum(TripStatus).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'لا توجد بيانات للتعديل');

export const tripListQuery = paginationQuery.extend({
  status: z.nativeEnum(TripStatus).optional(),
});

export const assignDelegateSchema = z
  .object({
    delegateId: uuid,
    pricePerPerson: money({ min: 0.01, max: 100_000_000 }),
  })
  .strict();

export const updatePriceSchema = z
  .object({
    pricePerPerson: money({ min: 0.01, max: 100_000_000 }),
    // Required by the service once the assignment is locked (manager change).
    reason: reasonSchema.optional().or(z.literal('').transform(() => undefined)),
  })
  .strict();

// ---------------------------------------------------------------------------
// Pilgrims
// ---------------------------------------------------------------------------

export const createPilgrimSchema = z
  .object({
    name: arabicName,
    passportNumber: z
      .string()
      .trim()
      .min(4, 'رقم جواز السفر غير صحيح')
      .max(40)
      .regex(/^[A-Za-z0-9-]+$/, 'رقم جواز السفر يجب أن يتكون من حروف وأرقام فقط'),
    nationalId: z
      .string()
      .trim()
      .regex(/^\d{6,20}$/, 'الرقم القومي غير صحيح')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    birthDate: dateOnly.optional(),
    job: optionalText(120, 'المهنة'),
    address: optionalText(255, 'العنوان'),
    notes: optionalText(1000, 'الملاحظات'),
    delegateId: uuid,
    tripId: uuid,
  })
  .strict();

// Edit: optional fields can be cleared — '' or null stores null.
const clearable = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? null : v), schema.nullable().optional());

export const updatePilgrimSchema = z
  .object({
    name: arabicName.optional(),
    passportNumber: createPilgrimSchema.shape.passportNumber.optional(),
    nationalId: clearable(z.string().trim().regex(/^\d{6,20}$/, 'الرقم القومي غير صحيح')),
    birthDate: clearable(dateOnly),
    job: clearable(z.string().trim().max(120, 'المهنة طويل جداً')),
    address: clearable(z.string().trim().max(255, 'العنوان طويل جداً')),
    notes: clearable(z.string().trim().max(1000, 'الملاحظات طويل جداً')),
    delegateId: uuid.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'لا توجد بيانات للتعديل');

export const cancelPilgrimSchema = z
  .object({
    reason: reasonSchema,
  })
  .strict();

export const delegateTripPilgrimsQuery = z.object({
  status: z.enum(['ACTIVE', 'CANCELLED']).default('ACTIVE'),
});

export const transferPilgrimSchema = z
  .object({
    toTripId: uuid,
    reason: optionalText(500, 'سبب النقل'),
  })
  .strict();

export const pilgrimListQuery = paginationQuery.extend({
  tripId: uuid.optional(),
  delegateId: uuid.optional(),
  documentStatus: z.enum(['ALL', 'COMPLETE', 'INCOMPLETE']).default('ALL'),
  // Cancelled pilgrims are hidden from operational lists unless asked for.
  status: z.enum(['ACTIVE', 'CANCELLED', 'ALL']).default('ACTIVE'),
});

// ---------------------------------------------------------------------------
// Payments & finance
// ---------------------------------------------------------------------------

/** Physical paper receipt number, typed by the employee (never generated). */
export const receiptNumberSchema = z
  .string({ required_error: 'يجب إدخال رقم الإيصال الورقي' })
  .transform(normalizeReceiptNumber)
  .pipe(
    z
      .string()
      .min(1, 'يجب إدخال رقم الإيصال الورقي')
      .max(40, 'رقم الإيصال طويل جداً')
      .regex(/^[\p{L}\p{N}\/\- ]+$/u, 'رقم الإيصال يجب أن يتكون من حروف وأرقام فقط'),
  );

/** Sent as multipart/form-data together with the receipt scan (`file`). */
export const createPaymentSchema = z
  .object({
    delegateId: uuid,
    amount: money({ min: 0.01, max: 100_000_000_000 }),
    receiptNumber: receiptNumberSchema,
    paymentMethod: z.nativeEnum(PaymentMethod),
    transferType: z.nativeEnum(TransferType).optional(),
    referenceNumber: referenceText(120, 'الرقم المرجعي للتحويل'),
    paymentDate: dateOnly,
    notes: optionalText(500, 'الملاحظات'),
  })
  .strict()
  .refine((v) => v.paymentMethod === PaymentMethod.TRANSFER || !v.transferType, {
    message: 'نوع التحويل يُستخدم فقط مع طريقة الدفع بالتحويل',
    path: ['transferType'],
  });

export const voidPaymentSchema = z
  .object({
    reason: reasonSchema,
  })
  .strict();

export const refundSchema = z
  .object({
    delegateId: uuid,
    amount: money({ min: 0.01, max: 100_000_000_000 }),
    reason: reasonSchema,
    relatedPaymentId: uuid.optional(),
    refundDate: dateOnly,
  })
  .strict();

export const correctionSchema = z
  .object({
    delegateId: uuid,
    amount: money({ min: 0.01, max: 100_000_000_000 }),
    // INCREASE = إضافة على الحساب, DECREASE = خصم من الحساب
    direction: z.enum(['INCREASE', 'DECREASE']),
    reason: reasonSchema,
    relatedPaymentId: uuid.optional(),
  })
  .strict();

export const movementListQuery = paginationQuery.extend({
  delegateId: uuid.optional(),
  kind: z.enum(['PAYMENT', 'PAYMENT_VOID', 'REFUND', 'CORRECTION']).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export const paymentListQuery = paginationQuery.extend({
  delegateId: uuid.optional(),
  status: z.enum(['ACTIVE', 'VOIDED']).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

// Passenger lists: passport number / national ID columns are optional (default shown).
const columnFlag = z.enum(['0', '1']).default('1').transform((v) => v === '1');
const passengerColumnsQuery = { passport: columnFlag, nationalId: columnFlag };

export const reportTripQuery = z.object({ tripId: uuid, ...passengerColumnsQuery });
export const reportDelegateTripQuery = z.object({ delegateId: uuid, tripId: uuid, ...passengerColumnsQuery });

export const missingDocumentsQuery = z.object({
  tripId: uuid.optional(),
  delegateId: uuid.optional(),
});

export const statementParams = z.object({ delegateId: uuid });

export const paymentHistoryQuery = z.object({
  delegateId: uuid.optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export type TripReportQuery = z.infer<typeof reportTripQuery>;
export type DelegateTripReportQuery = z.infer<typeof reportDelegateTripQuery>;
export type MissingDocumentsQuery = z.infer<typeof missingDocumentsQuery>;
export type StatementParams = z.infer<typeof statementParams>;
export type PaymentHistoryQuery = z.infer<typeof paymentHistoryQuery>;

export const auditListQuery = paginationQuery.extend({
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(60).optional(),
});

export const adjustmentListQuery = paginationQuery.extend({
  delegateId: uuid.optional(),
});

export type AdjustmentListQuery = z.infer<typeof adjustmentListQuery>;

// ---------------------------------------------------------------------------
// Company expenses
// ---------------------------------------------------------------------------

const expenseCategory = z.nativeEnum(ExpenseCategory, {
  errorMap: () => ({ message: 'اختر تصنيف المصروف' }),
});

// multipart/form-data: all values arrive as strings; the file is `file`.
export const createExpenseSchema = z
  .object({
    category: expenseCategory,
    amount: z
      .string({ required_error: 'المبلغ مطلوب' })
      .trim()
      .min(1, 'المبلغ مطلوب')
      .pipe(money({ max: 100_000_000_000 }))
      // Decimal comparison (no floating point).
      .refine((v) => new Prisma.Decimal(v).greaterThan(0), 'المبلغ يجب أن يكون أكبر من صفر'),
    expenseDate: z.string({ required_error: 'تاريخ المصروف مطلوب' }).min(1, 'تاريخ المصروف مطلوب').pipe(dateOnly),
    paymentMethod: z.nativeEnum(PaymentMethod, { errorMap: () => ({ message: 'اختر طريقة الدفع' }) }),
    transferType: z.nativeEnum(TransferType, { errorMap: () => ({ message: 'اختر نوع التحويل' }) }).optional(),
    referenceNumber: referenceText(120, 'الرقم المرجعي'),
    description: z
      .string({ required_error: 'البيان مطلوب' })
      .trim()
      .min(2, 'اكتب بيان المصروف (حرفان على الأقل)')
      .max(500, 'البيان طويل جداً'),
    notes: optionalText(1000, 'الملاحظات'),
  })
  .strict()
  .refine((v) => v.paymentMethod !== PaymentMethod.TRANSFER || Boolean(v.transferType), {
    message: 'اختر نوع التحويل',
    path: ['transferType'],
  })
  .refine((v) => v.paymentMethod === PaymentMethod.TRANSFER || !v.transferType, {
    message: 'نوع التحويل يُستخدم فقط مع طريقة الدفع بالتحويل',
    path: ['transferType'],
  });

export const voidExpenseSchema = z.object({ reason: reasonSchema }).strict();

/** Filters shared by the list and the exports (same rules → same totals). */
const expenseFilters = {
  category: expenseCategory.optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
};

export const expenseListQuery = paginationQuery.extend({
  ...expenseFilters,
  status: z.enum(['ACTIVE', 'VOIDED']).optional(),
});

export const expenseReportQuery = z.object({
  ...expenseFilters,
  search: paginationQuery.shape.search,
  // Voided expenses are left out of exports unless explicitly asked for.
  includeVoided: z.enum(['0', '1']).default('0').transform((v) => v === '1'),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type ExpenseListQuery = z.infer<typeof expenseListQuery>;
export type ExpenseReportQuery = z.infer<typeof expenseReportQuery>;

export { uuidParam };

export { uuid } from './common';
