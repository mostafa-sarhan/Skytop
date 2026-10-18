import { z } from 'zod';
import {
  DelegateStatus,
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
  reasonSchema,
  uuid,
  uuidParam,
} from './common';
import { normalizeReceiptNumber } from '../utils/receiptNumber';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginSchema = z
  .object({
    username: z.string().trim().min(3, 'اسم المستخدم غير صحيح').max(80),
    password: z.string().min(6, 'كلمة المرور غير صحيحة').max(200),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(6).max(200),
    newPassword: z.string().min(8, 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف').max(200),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف').max(200),
    mustChangePassword: z.boolean().default(true),
  })
  .strict();

// ---------------------------------------------------------------------------
// Users (manager only)
// ---------------------------------------------------------------------------

export const createUserSchema = z
  .object({
    fullName: arabicName,
    username: z
      .string()
      .trim()
      .min(3, 'اسم المستخدم يجب ألا يقل عن 3 أحرف')
      .max(80)
      .regex(/^[a-zA-Z0-9._-]+$/, 'اسم المستخدم يجب أن يتكون من حروف إنجليزية وأرقام فقط'),
    password: z.string().min(8, 'كلمة المرور يجب ألا تقل عن 8 أحرف').max(200),
    role: z.nativeEnum(Role),
  })
  .strict();

export const updateUserSchema = z
  .object({
    fullName: arabicName.optional(),
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
    referenceNumber: optionalText(120, 'الرقم المرجعي للتحويل'),
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

export const reportTripQuery = z.object({ tripId: uuid });
export const reportDelegateQuery = z.object({ delegateId: uuid });

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
export type DelegateReportQuery = z.infer<typeof reportDelegateQuery>;
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

export { uuidParam };

export { uuid } from './common';
export { reportDelegateQuery as delegateReportQuery };
