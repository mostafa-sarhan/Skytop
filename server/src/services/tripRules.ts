import { TripStatus } from '@prisma/client';
import { AppError } from '../utils/AppError';

/**
 * What each trip status allows — the single place these rules live.
 *
 *   OPEN       normal operations.
 *   CLOSED     the passenger list is closed: no new delegates, no new pilgrims,
 *              no transfers in or out (and no moving a pilgrim to another
 *              delegate). Pilgrim data, documents and last-minute
 *              cancellations are still allowed.
 *   COMPLETED  finished: operational data is read-only.
 *
 * Status is set by people; it is never derived from the trip dates (the
 * date-based phase قادمة / جارية الآن / منتهية is a separate concept).
 * Delegate pricing rules are unaffected by status.
 */
export interface TripCapabilities {
  canAddDelegates: boolean;
  canAddPilgrims: boolean;
  /** Transfers in/out and moving a pilgrim to another delegate. */
  canChangeManifest: boolean;
  /** Pilgrim data and documents. */
  canEditPilgrims: boolean;
  canCancelPilgrims: boolean;
  /** Trip name / dates / flight type. Status itself can always be changed. */
  canEditTrip: boolean;
}

const CAPABILITIES: Record<TripStatus, TripCapabilities> = {
  OPEN: {
    canAddDelegates: true,
    canAddPilgrims: true,
    canChangeManifest: true,
    canEditPilgrims: true,
    canCancelPilgrims: true,
    canEditTrip: true,
  },
  CLOSED: {
    canAddDelegates: false,
    canAddPilgrims: false,
    canChangeManifest: false,
    canEditPilgrims: true,
    canCancelPilgrims: true,
    canEditTrip: true,
  },
  COMPLETED: {
    canAddDelegates: false,
    canAddPilgrims: false,
    canChangeManifest: false,
    canEditPilgrims: false,
    canCancelPilgrims: false,
    canEditTrip: false,
  },
};

export const tripCapabilities = (status: TripStatus): TripCapabilities => CAPABILITIES[status];

type TripRef = { status: TripStatus; name?: string };

const named = (trip: TripRef) => (trip.name ? ` "${trip.name}"` : '');

const blocked = (trip: TripRef, action: string): AppError =>
  AppError.badRequest(
    trip.status === 'COMPLETED'
      ? `الرحلة${named(trip)} مكتملة: البيانات متاحة للعرض والتقارير فقط (${action})`
      : `قائمة الرحلة${named(trip)} مغلقة: ${action}. أعد فتح الرحلة إذا لزم التعديل`,
  );

export const assertTripAcceptsNewDelegates = (trip: TripRef) => {
  if (!tripCapabilities(trip.status).canAddDelegates) throw blocked(trip, 'لا يمكن إضافة مناديب جدد');
};

export const assertTripAcceptsNewPilgrims = (trip: TripRef) => {
  if (!tripCapabilities(trip.status).canAddPilgrims) throw blocked(trip, 'لا يمكن إضافة معتمرين جدد');
};

/** Transfers between trips: both the source and the target must allow it. */
export const assertTripsAllowTransfer = (from: TripRef, to: TripRef) => {
  if (!tripCapabilities(from.status).canChangeManifest) throw blocked(from, 'لا يمكن نقل معتمرين منها');
  if (!tripCapabilities(to.status).canChangeManifest) throw blocked(to, 'لا يمكن نقل معتمرين إليها');
};

/** Moving a pilgrim to another delegate inside the same trip. */
export const assertTripAllowsDelegateReassignment = (trip: TripRef) => {
  if (!tripCapabilities(trip.status).canChangeManifest) throw blocked(trip, 'لا يمكن نقل المعتمر إلى مندوب آخر');
};

export const assertTripAllowsPilgrimEdits = (trip: TripRef) => {
  if (!tripCapabilities(trip.status).canEditPilgrims) throw blocked(trip, 'لا يمكن تعديل بيانات المعتمرين أو مستنداتهم');
};

export const assertTripAllowsCancellation = (trip: TripRef) => {
  if (!tripCapabilities(trip.status).canCancelPilgrims) throw blocked(trip, 'لا يمكن استبعاد معتمرين');
};

export const assertTripEditable = (trip: TripRef) => {
  if (!tripCapabilities(trip.status).canEditTrip) throw blocked(trip, 'لا يمكن تعديل بيانات الرحلة');
};
