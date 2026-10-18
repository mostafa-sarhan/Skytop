export type Role = 'EMPLOYEE' | 'MANAGER';
export type DelegateStatus = 'ACTIVE' | 'INACTIVE';
export type TripStatus = 'OPEN' | 'CLOSED' | 'COMPLETED';
export type FlightType = 'DIRECT' | 'INDIRECT';
export type DocumentType = 'PASSPORT_IMAGE' | 'PERSONAL_PHOTO';
export type PilgrimStatus = 'ACTIVE' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'TRANSFER';
export type TransferType = 'INSTAPAY' | 'BANK_TRANSFER';
export type PaymentStatus = 'ACTIVE' | 'VOIDED';
export type AccountStatus = 'DUE' | 'SETTLED' | 'CREDIT';
export type DocumentStatus = 'COMPLETE' | 'MISSING_PASSPORT' | 'MISSING_PHOTO' | 'MISSING_BOTH';
export type AdjustmentType = 'REFUND' | 'CORRECTION';
/** Correction direction: INCREASE = إضافة على الحساب, DECREASE = خصم من الحساب. */
export type AdjustmentDirection = 'INCREASE' | 'DECREASE';
/** Effect on what the delegate still owes. */
export type AccountEffect = 'INCREASE' | 'DECREASE';
export type MovementKind = 'PAYMENT' | 'PAYMENT_VOID' | 'REFUND' | 'CORRECTION';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface User {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  passwordResetAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResult {
  user: User;
  token: string;
}

/**
 * Delegate account summary, computed on the server:
 * totalRequired = Σ(active pilgrims × price per trip) + manager corrections
 * totalPaid = active payments − refunds
 */
export interface DelegateAccount {
  delegateId: string;
  tripsRequired: string;
  correctionsNet: string;
  totalRequired: string;
  paymentsTotal: string;
  refundsTotal: string;
  totalPaid: string;
  remaining: string;
  credit: string;
  status: AccountStatus;
}

export interface Delegate {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string | null;
  status: DelegateStatus;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  /** Trips that have not finished yet (operational list only). */
  activeTripCount?: number;
}

export interface PaymentRow {
  id: string;
  delegateId: string;
  amount: string;
  /** Physical paper receipt number entered by the employee. */
  receiptNumber: string | null;
  /** Old system-generated number (pre-migration records only). */
  legacyReceiptNumber: string | null;
  hasReceiptScan: boolean;
  receiptScanMimeType: string | null;
  paymentMethod: PaymentMethod;
  transferType: TransferType | null;
  referenceNumber: string | null;
  paymentDate: string;
  status: PaymentStatus;
  notes: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  createdAt: string;
  delegate?: { id: string; name: string; phone?: string };
  createdBy?: { id: string; fullName: string };
  voidedBy?: { id: string; fullName: string } | null;
}

/** Operational delegate profile (no financial data). */
export interface DelegateDetail extends Delegate {
  tripCount: number;
  activeTripCount: number;
  activePilgrimCount: number;
}

/** A trip of a delegate with the delegate's ACTIVE pilgrim count in it. */
export interface DelegateTripRow {
  tripId: string;
  name: string;
  departureDate: string;
  returnDate: string;
  flightType: FlightType;
  status: TripStatus;
  isActive: boolean;
  capabilities: TripCapabilities;
  activePilgrimCount: number;
}

export interface DelegateTripPilgrim {
  id: string;
  name: string;
  passportNumber: string;
  nationalId: string | null;
  birthDate: string | null;
  job: string | null;
  notes: string | null;
  status: PilgrimStatus;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: { id: string; fullName: string } | null;
  documentStatus: DocumentStatus;
}

/** Workspace: pilgrims of one delegate in one trip. */
export interface DelegateTripPilgrims {
  delegate: { id: string; name: string; phone: string; status: DelegateStatus; isSystem: boolean };
  trip: {
    id: string;
    name: string;
    departureDate: string;
    returnDate: string;
    flightType: FlightType;
    status: TripStatus;
  };
  /** Which list `pilgrims` holds; summary.total always counts ACTIVE ones. */
  status: PilgrimStatus;
  capabilities: TripCapabilities;
  summary: {
    total: number;
    cancelled: number;
    completeDocuments: number | null;
    incompleteDocuments: number | null;
  };
  pilgrims: DelegateTripPilgrim[];
}

/** Row of حسابات المناديب. */
export interface DelegateAccountListItem {
  id: string;
  name: string;
  phone: string;
  status: DelegateStatus;
  isSystem: boolean;
  account: DelegateAccount;
  /** Date of the latest ACTIVE payment, if any. */
  lastPaymentDate: string | null;
}

export interface DelegateAccountList extends Paginated<DelegateAccountListItem> {
  /** Accounts per state for the current search (filter tabs). */
  counts: Record<'ALL' | AccountStatus, number>;
}

export interface Trip {
  id: string;
  name: string;
  departureDate: string;
  returnDate: string;
  flightType: FlightType;
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
  /** Where the trip is in time (COMPLETED is always FINISHED). */
  phase?: TripPhase;
  capabilities?: TripCapabilities;
  /** ACTIVE pilgrims only. */
  pilgrimCount?: number;
  delegateCount?: number;
}

export type TripPhase = 'UPCOMING' | 'ONGOING' | 'FINISHED';

/** What the trip's status allows (computed by the API, see tripRules.ts). */
export interface TripCapabilities {
  canAddDelegates: boolean;
  canAddPilgrims: boolean;
  /** Transfers in/out and moving a pilgrim to another delegate. */
  canChangeManifest: boolean;
  canEditPilgrims: boolean;
  canCancelPilgrims: boolean;
  canEditTrip: boolean;
}

/** A delegate inside a trip (operational; no totals owed). */
export interface TripAssignment {
  id: string;
  pricePerPerson: string | null;
  createdAt: string;
  delegate: { id: string; name: string; phone: string; status: DelegateStatus; isSystem: boolean };
  /** ACTIVE pilgrims of this delegate in this trip. */
  pilgrimCount: number;
  /** ACTIVE pilgrims of this delegate in this trip with missing documents. */
  incompleteDocumentCount: number;
  priceLocked: boolean;
}

export interface TripDetail extends Trip {
  phase: TripPhase;
  capabilities: TripCapabilities;
  summary: { delegateCount: number; activePilgrimCount: number; incompleteDocumentCount: number };
  delegates: TripAssignment[];
}

export interface Pilgrim {
  id: string;
  name: string;
  passportNumber: string;
  nationalId: string | null;
  birthDate: string | null;
  job: string | null;
  notes: string | null;
  status?: PilgrimStatus;
  createdAt: string;
  updatedAt: string;
  delegate: { id: string; name: string; phone?: string; address?: string; status?: DelegateStatus };
  trip?: { id: string; name: string; departureDate?: string; returnDate?: string; status: TripStatus };
  documentStatus: DocumentStatus;
}

export interface PilgrimDocument {
  id: string;
  type: DocumentType;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface PilgrimTransfer {
  id: string;
  createdAt: string;
  reason: string | null;
  fromTrip: { id: string; name: string } | null;
  toTrip: { id: string; name: string };
  performedBy: { id: string; fullName: string };
}

export interface PilgrimDetail extends Pilgrim {
  tripCapabilities: TripCapabilities;
  documents: PilgrimDocument[];
  transfers: PilgrimTransfer[];
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: { id: string; fullName: string } | null;
}

/** Row of سجل الحركات المالية (manager only), derived on the server. */
export interface FinancialMovement {
  id: string;
  kind: MovementKind;
  date: string;
  recordedAt: string;
  delegate: { id: string; name: string };
  amount: string;
  effect: AccountEffect;
  receiptNumber: string | null;
  reason: string | null;
  paymentId: string | null;
  performedBy: { id: string; fullName: string } | null;
}

export interface AccountTripRow {
  tripId: string;
  tripName: string;
  departureDate: string;
  returnDate: string;
  tripStatus: TripStatus;
  pricePerPerson: string;
  activePilgrimCount: number;
  requiredAmount: string;
}

export interface AccountAdjustmentRow {
  id: string;
  type: AdjustmentType;
  effect: AccountEffect;
  amount: string;
  reason: string;
  effectiveDate: string;
  createdAt: string;
  performedBy: { id: string; fullName: string };
}

/** حساب المندوب. `adjustments` is null for employees (manager-only detail). */
export interface DelegateAccountStatement {
  delegate: { id: string; name: string; phone: string; address: string; status: DelegateStatus; isSystem: boolean };
  summary: DelegateAccount;
  trips: AccountTripRow[];
  payments: PaymentRow[];
  adjustments: AccountAdjustmentRow[] | null;
  generatedAt: string;
}

export interface FinancialAdjustment {
  id: string;
  type: AdjustmentType;
  direction: AdjustmentDirection | null;
  effect: AccountEffect;
  amount: string;
  reason: string;
  effectiveDate: string;
  createdAt: string;
  delegate: { id: string; name: string };
  performedBy: { id: string; fullName: string };
  relatedPayment?: {
    id: string;
    receiptNumber: string | null;
    legacyReceiptNumber: string | null;
    amount: string;
  } | null;
}

/** GET /dashboard/stats — role-aware; `finance` is null for employees. */
export interface DashboardStats {
  trips: { upcoming: number; ongoing: number };
  pilgrims: { active: number; cancelled: number };
  delegates: { active: number; total: number };
  documents: {
    incomplete: number;
    topTrips: Array<{ tripId: string; tripName: string; departureDate: string; phase: TripPhase; incomplete: number }>;
  };
  upcomingTrips: Array<{
    id: string;
    name: string;
    status: TripStatus;
    departureDate: string;
    returnDate: string;
    phase: TripPhase;
    delegateCount: number;
    activePilgrimCount: number;
    incompleteDocuments: number;
  }>;
  payments: { todayCount: number; recent: PaymentRow[] };
  finance: {
    totalRequired: string;
    totalPaid: string;
    totalRemaining: string;
    totalCredit: string;
    dueDelegates: number;
    creditDelegates: number;
    paymentCount: number;
    todayAmount: string;
  } | null;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
  createdAt: string;
  user: { id: string; fullName: string; username: string; role: Role };
}

export interface ReportMeta {
  title: string;
  generatedAt: string;
  filters: Record<string, string | null>;
}

export interface MissingDocumentsReport {
  meta: ReportMeta;
  rows: Array<{
    name: string;
    passportNumber: string;
    tripName: string;
    delegateName: string;
    documentStatus: DocumentStatus;
    hasPassportImage: boolean;
    hasPersonalPhoto: boolean;
  }>;
  summary: {
    total: number;
    incomplete: number;
    missingPassport: number;
    missingPhoto: number;
  };
}

export interface TripPilgrimsReport {
  meta: ReportMeta;
  trip: { id: string; name: string; departureDate: string; returnDate: string };
  rows: Array<{
    index: number;
    name: string;
    passportNumber: string;
    nationalId: string;
    birthDate: string;
    job: string;
    delegateName: string;
    documentStatus: DocumentStatus;
  }>;
  summary: { total: number; completeDocuments: number; incompleteDocuments: number };
}

export interface DelegatePilgrimsReport {
  meta: ReportMeta;
  delegate: { id: string; name: string; phone: string };
  rows: Array<{
    index: number;
    name: string;
    passportNumber: string;
    nationalId: string;
    birthDate: string;
    job: string;
    tripName: string;
    documentStatus: DocumentStatus;
  }>;
  summary: { total: number; completeDocuments: number; incompleteDocuments: number; tripsRequired: string };
}

export interface PaymentReportRow {
  index: number;
  receiptNumber: string;
  delegateName: string;
  amount: string;
  paymentMethod: PaymentMethod;
  transferType: string;
  referenceNumber: string;
  paymentDate: string;
  status: PaymentStatus;
  createdBy: string;
}

export interface PaymentReport {
  meta: ReportMeta;
  rows: PaymentReportRow[];
  summary: { count: number; totalActive: string };
}
