import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { DelegateTripRow } from '../api/types';
import { useAsync, validationMessages } from '../lib/hooks';
import { formatDate } from '../lib/format';
import { Field, Modal, SelectInput } from '../ui/primitives';
import { useToast } from '../ui/Toast';

export interface TransferablePilgrim {
  id: string;
  name: string;
  trip?: { id: string; name: string; departureDate?: string } | null;
  delegate: { id: string };
}

/**
 * نقل المعتمر إلى رحلة أخرى من رحلات نفس المندوب. Valid targets: the
 * delegate's trips that have not finished and whose list is still open (the
 * API enforces the same rule). The reason is optional.
 */
export const TransferModal = ({
  pilgrim,
  onClose,
  onDone,
}: {
  pilgrim: TransferablePilgrim;
  onClose: () => void;
  onDone: (toTripId: string) => void;
}) => {
  const toast = useToast();
  const [tripId, setTripId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trips = useAsync<DelegateTripRow[]>(
    (signal) =>
      api.get<DelegateTripRow[]>(`/delegates/${pilgrim.delegate.id}/trips`, { scope: 'active' }, signal),
    [pilgrim.delegate.id],
  );
  const options = (trips.data ?? []).filter(
    (trip) => trip.tripId !== pilgrim.trip?.id && trip.capabilities.canChangeManifest,
  );

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/pilgrims/${pilgrim.id}/transfer`, {
        toTripId: tripId,
        reason: reason.trim() || undefined,
      });
      toast.success('تم نقل المعتمر إلى الرحلة الجديدة');
      onClose();
      onDone(tripId);
    } catch (err) {
      setError(errorMessage(err, 'تعذر نقل المعتمر'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`نقل المعتمر — ${pilgrim.name}`}
      onClose={onClose}
      dismissible={!submitting}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className="btn" onClick={() => void submit()} disabled={submitting || !tripId}>
            {submitting ? 'جارٍ النقل...' : 'تأكيد النقل'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <dl className="kv">
        <dt>الرحلة الحالية</dt>
        <dd>
          <strong>{pilgrim.trip?.name ?? '—'}</strong>
          {pilgrim.trip?.departureDate ? ` — ${formatDate(pilgrim.trip.departureDate)}` : ''}
        </dd>
      </dl>
      <Field
        label="الرحلة الجديدة"
        required
        hint={trips.loading ? 'جارٍ تحميل رحلات المندوب...' : 'رحلات نفس المندوب المفتوحة فقط'}
      >
        <SelectInput value={tripId} onChange={(event) => setTripId(event.target.value)} disabled={trips.loading}>
          <option value="">{trips.loading ? 'جارٍ التحميل...' : 'اختر الرحلة'}</option>
          {options.map((trip) => (
            <option key={trip.tripId} value={trip.tripId}>
              {trip.name} — {formatDate(trip.departureDate)}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="سبب النقل" hint="اختياري — يظهر في سجل النقل">
        <textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      {trips.error ? <div className="alert error">تعذر تحميل رحلات المندوب</div> : null}
      {options.length === 0 && trips.data ? (
        <div className="alert warning">
          لا توجد رحلات مفتوحة أخرى مسند إليها هذا المندوب. أسند المندوب إلى رحلة مفتوحة أولاً من صفحة الرحلة.
        </div>
      ) : (
        <div className="alert info">يُحفظ النقل في سجل المعتمر، ويُحتسب المعتمر في الرحلة الجديدة فوراً.</div>
      )}
    </Modal>
  );
};

/** استبعاد معتمر: the reason is required; nothing is deleted. */
export const CancelPilgrimModal = ({
  pilgrim,
  tripName,
  onClose,
  onDone,
}: {
  pilgrim: { id: string; name: string; passportNumber: string };
  tripName: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      await api.post(`/pilgrims/${pilgrim.id}/cancel`, { reason: reason.trim() });
      toast.success(`تم استبعاد المعتمر ${pilgrim.name}`);
      onDone();
      onClose();
    } catch (err) {
      setFieldErrors(validationMessages(err));
      setError(errorMessage(err, 'تعذر استبعاد المعتمر'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="استبعاد معتمر"
      onClose={onClose}
      dismissible={!submitting}
      size="narrow"
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            رجوع
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => void submit()}
            disabled={submitting || reason.trim().length < 3}
          >
            {submitting ? 'جارٍ الاستبعاد...' : 'تأكيد الاستبعاد'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <dl className="kv">
        <dt>المعتمر</dt>
        <dd>
          <strong>{pilgrim.name}</strong> — <span className="mono">{pilgrim.passportNumber}</span>
        </dd>
        <dt>الرحلة</dt>
        <dd>{tripName}</dd>
      </dl>
      <div className="alert warning">
        سيتم إخراج المعتمر من عدد المعتمرين النشطين في هذه الرحلة ومن المطلوب من المندوب. بياناته
        ومستنداته وسجل نقله تبقى محفوظة، ويظهر في قائمة «المستبعدون».
      </div>
      <Field label="سبب الاستبعاد" required hint="3 أحرف على الأقل" error={fieldErrors.reason}>
        <textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
    </Modal>
  );
};
