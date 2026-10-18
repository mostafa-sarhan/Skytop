import type {
  AccountStatus,
  DelegateStatus,
  DocumentStatus,
  FlightType,
  AdjustmentDirection,
  AdjustmentType,
  MovementKind,
  PaymentMethod,
  PaymentStatus,
  Role,
  TransferType,
  TripPhase,
  TripStatus,
} from '../api/types';

/**
 * Money only. The API sends money as decimal strings, so counts (numbers)
 * are rejected by the type checker — use formatCount for those.
 */
export const formatAmount = (value?: string | null): string => {
  if (value === undefined || value === null || value === '') return '—';
  const raw = String(value).trim();
  const negative = raw.startsWith('-');
  const clean = negative ? raw.slice(1) : raw;
  const [intPart = '0', decPart = ''] = clean.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimals = decPart.padEnd(2, '0').slice(0, 2);
  return `${negative ? '-' : ''}${grouped}.${decimals}`;
};

/** Whole-number counts (pilgrims, trips, documents…): grouped, no decimals. */
export const formatCount = (value?: number | null): string =>
  value === undefined || value === null ? '—' : Math.trunc(value).toLocaleString('en-US');

export const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
};

const pad = (value: number): string => String(value).padStart(2, '0');

const toParts = (value: string | Date | null | undefined) => {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes(),
  };
};

export const formatDate = (value: string | Date | null | undefined): string => {
  const parts = toParts(value);
  if (!parts) return '—';
  return `${parts.year}/${pad(parts.month)}/${pad(parts.day)}`;
};

export const formatDateTime = (value: string | Date | null | undefined): string => {
  const parts = toParts(value);
  if (!parts) return '—';
  return `${formatDate(value)} ${pad(parts.hours)}:${pad(parts.minutes)}`;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
};

export const roleLabel: Record<Role, string> = {
  EMPLOYEE: 'موظف',
  MANAGER: 'مدير النظام',
};

export const delegateStatusLabel: Record<DelegateStatus, string> = {
  ACTIVE: 'نشط',
  INACTIVE: 'موقوف',
};

export const tripStatusLabel: Record<TripStatus, string> = {
  OPEN: 'مفتوحة',
  CLOSED: 'مغلقة',
  COMPLETED: 'مكتملة',
};

/** What each status currently means operationally (shown when changing it). */
export const tripStatusHint: Record<TripStatus, string> = {
  OPEN: 'يمكن إضافة المناديب والمعتمرين وتعديل بيانات الرحلة.',
  CLOSED:
    'تم إغلاق قائمة الرحلة. لا يمكن إضافة أو نقل معتمرين، مع استمرار تحديث البيانات والمستندات والاستبعاد عند الحاجة.',
  COMPLETED: 'الرحلة منتهية والبيانات متاحة للعرض والتقارير فقط.',
};

export const tripStatusTone = (status: TripStatus): 'success' | 'warning' | 'default' =>
  status === 'OPEN' ? 'success' : status === 'CLOSED' ? 'warning' : 'default';

export const tripPhaseLabel: Record<TripPhase, string> = {
  UPCOMING: 'قادمة',
  ONGOING: 'جارية الآن',
  FINISHED: 'منتهية',
};

export const flightTypeLabel: Record<FlightType, string> = {
  DIRECT: 'مباشرة',
  INDIRECT: 'غير مباشرة',
};

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  CASH: 'نقداً',
  TRANSFER: 'تحويل',
};

export const transferTypeLabel: Record<TransferType, string> = {
  INSTAPAY: 'انستاباي',
  BANK_TRANSFER: 'تحويل بنكي',
};

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  ACTIVE: 'مسجلة',
  VOIDED: 'ملغاة',
};

export const accountStatusLabel: Record<AccountStatus, string> = {
  DUE: 'عليه مبلغ',
  SETTLED: 'مسدد',
  CREDIT: 'له رصيد',
};

/** CSS tone for a balance pill. */
export const accountTone = (status?: AccountStatus): 'debt' | 'credit' | 'settled' =>
  status === 'DUE' ? 'debt' : status === 'CREDIT' ? 'credit' : 'settled';

export const movementKindLabel: Record<MovementKind, string> = {
  PAYMENT: 'دفعة',
  PAYMENT_VOID: 'إلغاء دفعة',
  REFUND: 'استرداد',
  CORRECTION: 'تسوية',
};

/** Label shown for the paper receipt of a payment. */
export const receiptNumberOf = (payment: {
  receiptNumber: string | null;
  legacyReceiptNumber: string | null;
}): string => payment.receiptNumber ?? (payment.legacyReceiptNumber ? `${payment.legacyReceiptNumber} (قديم)` : '—');

export const documentStatusLabel: Record<DocumentStatus, string> = {
  COMPLETE: 'مكتمل',
  MISSING_PASSPORT: 'صورة جواز السفر ناقصة',
  MISSING_PHOTO: 'الصورة الشخصية ناقصة',
  MISSING_BOTH: 'المستندان ناقصان',
};

export const auditActionLabel: Record<string, string> = {
  DELEGATE_PRICE_CHANGE: 'تعديل سعر مندوب',
  PAYMENT_VOID: 'إلغاء دفعة',
  REFUND: 'استرداد مالي',
  FINANCIAL_CORRECTION: 'تسوية مالية',
  PILGRIM_TRANSFER: 'نقل معتمر',
  PILGRIM_CANCELLED: 'استبعاد معتمر',
  USER_CREATED: 'إنشاء مستخدم',
  USER_ROLE_CHANGED: 'تغيير دور المستخدم',
  USER_ACTIVATED: 'تفعيل مستخدم',
  USER_DEACTIVATED: 'إيقاف مستخدم',
  PASSWORD_RESET: 'إعادة تعيين كلمة مرور',
  DELEGATE_CREATED: 'إضافة مندوب',
  DELEGATE_UPDATED: 'تعديل مندوب',
  DELEGATE_STATUS_CHANGED: 'تغيير حالة مندوب',
};

export const adjustmentTypeLabel: Record<AdjustmentType, string> = {
  REFUND: 'استرداد',
  CORRECTION: 'تسوية',
};

export const adjustmentDirectionLabel: Record<AdjustmentDirection, string> = {
  INCREASE: 'إضافة على الحساب',
  DECREASE: 'خصم من الحساب',
};
