import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, download, errorMessage } from '../../api/client';
import type { Delegate, Paginated, TripDetail, TripStatus } from '../../api/types';
import { useAsync, validationMessages } from '../../lib/hooks';
import {
  delegateStatusLabel,
  flightTypeLabel,
  formatAmount,
  formatDate,
  tripPhaseLabel,
  tripStatusHint,
  tripStatusLabel,
  tripStatusTone,
} from '../../lib/format';
import {
  Badge,
  Breadcrumbs,
  EmptyState,
  Field,
  Icon,
  LoadingBlock,
  Modal,
  PageHeader,
  SelectInput,
  TextInput,
} from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { useAuth } from '../../auth/AuthContext';
import { TripFormModal } from './TripsPage';
import { useRowLink } from '../../lib/rowLink';

/** Changes the trip status, explaining what each status allows. */
const TripStatusModal = ({
  trip,
  onClose,
  onSaved,
}: {
  trip: TripDetail;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const toast = useToast();
  const [status, setStatus] = useState<TripStatus>(trip.status);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/trips/${trip.id}/status`, { status });
      toast.success(`حالة الرحلة الآن: ${tripStatusLabel[status]}`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'تعذر تغيير حالة الرحلة'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`حالة الرحلة — ${trip.name}`}
      onClose={onClose}
      dismissible={!submitting}
      size="narrow"
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void submit()}
            disabled={submitting || status === trip.status}
          >
            {submitting ? 'جارٍ الحفظ...' : 'حفظ الحالة'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <div className="stack tight">
        {(Object.keys(tripStatusLabel) as TripStatus[]).map((value) => (
          <label key={value} className="row" style={{ alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="trip-status"
              checked={status === value}
              onChange={() => setStatus(value)}
              style={{ marginTop: 4 }}
            />
            <span>
              <strong>{tripStatusLabel[value]}</strong>
              <div className="muted small">{tripStatusHint[value]}</div>
            </span>
          </label>
        ))}
      </div>
    </Modal>
  );
};

/**
 * Trip workspace: header, operational summary and the delegates of the trip.
 * Each delegate row leads straight to that delegate's pilgrims in this trip
 * (/delegates/:delegateId/trips/:tripId/pilgrims). No totals owed are shown.
 */
export const TripDetailPage = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const rowLink = useRowLink();
  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const { isManager } = useAuth();
  const [priceAssignment, setPriceAssignment] = useState<PriceAssignment | null>(null);

  const trip = useAsync<TripDetail>((signal) => api.get<TripDetail>(`/trips/${id}`, undefined, signal), [id]);

  if (trip.loading && !trip.data)
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  if (trip.error || !trip.data)
    return (
      <div className="page">
        <Breadcrumbs items={[{ label: 'الرحلات', to: '/trips' }, { label: 'الرحلة' }]} />
        <EmptyState
          title="تعذر تحميل الرحلة"
          action={
            <Link className="btn secondary" to="/trips">
              رجوع للرحلات
            </Link>
          }
        />
      </div>
    );

  const data = trip.data;
  const can = data.capabilities;
  const workspace = (delegateId: string) => `/delegates/${delegateId}/trips/${data.id}/pilgrims`;

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: 'الرحلات', to: '/trips' }, { label: data.name }]} />
      <PageHeader
        title={data.name}
        subtitle={`السفر ${formatDate(data.departureDate)} — العودة ${formatDate(data.returnDate)} — طيران ${flightTypeLabel[data.flightType]}`}
        actions={
          <>
            {can.canAddDelegates ? (
              <button type="button" className="btn" onClick={() => setAssigning(true)}>
                <Icon name="plus" size={15} /> إضافة مندوب للرحلة
              </button>
            ) : null}
            {can.canEditTrip ? (
              <button type="button" className="btn secondary" onClick={() => setEditing(true)}>
                <Icon name="edit" size={15} /> تعديل البيانات
              </button>
            ) : null}
            <button type="button" className="btn secondary" onClick={() => setChangingStatus(true)}>
              <Icon name="refresh" size={15} /> تغيير الحالة
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => download('/reports/trip-pilgrims/excel', { tripId: id })}
            >
              <Icon name="download" size={15} /> Excel
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => download('/reports/trip-pilgrims/pdf', { tripId: id })}
            >
              <Icon name="download" size={15} /> PDF
            </button>
          </>
        }
      />

      <div className="row" style={{ marginBottom: 12 }}>
        <Badge tone={tripStatusTone(data.status)}>الحالة: {tripStatusLabel[data.status]}</Badge>
        <Badge>{tripPhaseLabel[data.phase]}</Badge>
        {data.status !== 'OPEN' ? <span className="muted small">{tripStatusHint[data.status]}</span> : null}
      </div>

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="stat-card accent">
          <span className="label">عدد المناديب</span>
          <span className="value mono">{data.summary.delegateCount}</span>
        </div>
        <div className="stat-card accent-success">
          <span className="label">المعتمرون النشطون</span>
          <span className="value mono">{data.summary.activePilgrimCount}</span>
        </div>
        <div className={`stat-card ${data.summary.incompleteDocumentCount > 0 ? 'accent-warning' : 'accent-info'}`}>
          <span className="label">ملفات ناقصة</span>
          <span className="value mono">{data.summary.incompleteDocumentCount}</span>
          <span className="hint">معتمرون نشطون بمستندات غير مكتملة</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>المناديب في هذه الرحلة</h3>
          <span className="muted small">افتح المندوب لإدارة معتمريه في هذه الرحلة</span>
        </div>
        <div className="card-body flush">
          {data.delegates.length === 0 ? (
            <EmptyState
              title="لا يوجد مناديب في هذه الرحلة بعد"
              description={
                can.canAddDelegates
                  ? 'أضف مندوباً وحدد سعر الفرد له، ثم أضف معتمريه من صفحته داخل الرحلة'
                  : tripStatusHint[data.status]
              }
              action={
                can.canAddDelegates ? (
                  <button type="button" className="btn" onClick={() => setAssigning(true)}>
                    إضافة مندوب للرحلة
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data stack-on-phone stack-on-tablet">
                <thead>
                  <tr>
                    <th>المندوب</th>
                    <th className="num">المعتمرون النشطون</th>
                    <th>المستندات</th>
                    <th className="num">سعر الفرد</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.delegates.map((row) => (
                    <tr key={row.id} {...rowLink(workspace(row.delegate.id))}>
                      <td className="primary-cell">
                        <Link to={workspace(row.delegate.id)}>
                          <strong>{row.delegate.name}</strong>
                        </Link>
                        {row.delegate.status !== 'ACTIVE' ? (
                          <>
                            {' '}
                            <Badge tone="warning">{delegateStatusLabel[row.delegate.status]}</Badge>
                          </>
                        ) : null}
                        <div className="muted small mono">{row.delegate.phone}</div>
                      </td>
                      <td className="num mono">
                        <strong>{row.pilgrimCount}</strong>
                      </td>
                      <td>
                        {row.pilgrimCount === 0 ? (
                          <span className="muted small">—</span>
                        ) : row.incompleteDocumentCount > 0 ? (
                          <Badge tone="warning">{row.incompleteDocumentCount} ملفات ناقصة</Badge>
                        ) : (
                          <Badge tone="success">مكتملة</Badge>
                        )}
                      </td>
                      <td className="num mono">{formatAmount(row.pricePerPerson ?? '0')}</td>
                      <td>
                        <div className="row">
                          <Link className="btn sm" to={workspace(row.delegate.id)}>
                            <Icon name="pilgrim" size={14} /> معتمرو المندوب
                          </Link>
                          {!row.priceLocked || isManager ? (
                            <button
                              type="button"
                              className="btn ghost sm"
                              onClick={() =>
                                setPriceAssignment({
                                  delegateId: row.delegate.id,
                                  name: row.delegate.name,
                                  current: row.pricePerPerson ?? '0.00',
                                  locked: row.priceLocked,
                                  pilgrimCount: row.pilgrimCount,
                                })
                              }
                            >
                              <Icon name="edit" size={14} /> تعديل السعر
                            </button>
                          ) : (
                            <span className="muted small">السعر مقفل — تعديله للمدير</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <TripFormModal trip={data} onClose={() => setEditing(false)} onSaved={trip.reload} />
      ) : null}
      {changingStatus ? (
        <TripStatusModal trip={data} onClose={() => setChangingStatus(false)} onSaved={trip.reload} />
      ) : null}
      {assigning ? (
        <AssignDelegateModal
          tripId={id}
          assigned={data.delegates.map((row) => row.delegate.id)}
          onClose={() => setAssigning(false)}
          onSaved={trip.reload}
        />
      ) : null}
      {priceAssignment ? (
        <PriceModal
          tripId={id}
          assignment={priceAssignment}
          onClose={() => setPriceAssignment(null)}
          onSaved={trip.reload}
        />
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" className="btn secondary" onClick={() => navigate('/trips')}>
          <Icon name="arrow-right" size={15} /> رجوع للرحلات
        </button>
        <Link className="btn ghost" to={`/pilgrims?tripId=${id}`}>
          كل معتمري الرحلة
        </Link>
      </div>
    </div>
  );
};

const AssignDelegateModal = ({
  tripId,
  assigned,
  onClose,
  onSaved,
}: {
  tripId: string;
  assigned: string[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const toast = useToast();
  const [delegateId, setDelegateId] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const delegates = useAsync<Paginated<Delegate>>(
    (signal) => api.get<Paginated<Delegate>>('/delegates', { pageSize: 200, status: 'ACTIVE' }, signal),
    [],
  );

  const options = (delegates.data?.items ?? []).filter((item) => !assigned.includes(item.id));

  const submit = async () => {
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      await api.post(`/trips/${tripId}/delegates`, { delegateId, pricePerPerson: price });
      toast.success('تمت إضافة المندوب إلى الرحلة');
      onSaved();
      onClose();
    } catch (err) {
      setFieldErrors(validationMessages(err));
      setError(errorMessage(err, 'تعذر إضافة المندوب للرحلة'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="إضافة مندوب للرحلة"
      onClose={onClose}
      dismissible={!submitting}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void submit()}
            disabled={submitting || !delegateId || !price}
          >
            {submitting ? 'جارٍ الحفظ...' : 'إضافة للرحلة'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <Field label="المندوب" required error={fieldErrors.delegateId} hint="المناديب النشطون غير المضافين لهذه الرحلة">
        <SelectInput value={delegateId} onChange={(event) => setDelegateId(event.target.value)}>
          <option value="">اختر المندوب</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {item.phone}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field
        label="سعر الفرد"
        required
        error={fieldErrors.pricePerPerson}
        hint="السعر المتفق عليه مع هذا المندوب لكل معتمر في هذه الرحلة"
      >
        <TextInput
          className="input-amount"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          dir="ltr"
          inputMode="decimal"
          latinDigits
          placeholder="0.00"
        />
      </Field>
      {delegates.data && options.length === 0 ? (
        <div className="alert warning">كل المناديب النشطين مضافون بالفعل إلى هذه الرحلة.</div>
      ) : null}
    </Modal>
  );
};

interface PriceAssignment {
  delegateId: string;
  name: string;
  current: string;
  locked: boolean;
  pilgrimCount: number;
}

const PriceModal = ({
  tripId,
  assignment,
  onClose,
  onSaved,
}: {
  tripId: string;
  assignment: PriceAssignment;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const toast = useToast();
  const [price, setPrice] = useState(assignment.current);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      await api.patch(`/trips/${tripId}/delegates/${assignment.delegateId}/price`, {
        pricePerPerson: price,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      toast.success('تم تحديث سعر الفرد وتحديث المطلوب من المندوب');
      onSaved();
      onClose();
    } catch (err) {
      setFieldErrors(validationMessages(err));
      setError(
        errorMessage(
          err,
          'تعذر تحديث السعر — السعر مقفل لوجود معتمرين لهذا المندوب في الرحلة، والتعديل متاح لمدير النظام فقط',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`تعديل سعر الفرد — ${assignment.name}`}
      onClose={onClose}
      dismissible={!submitting}
      size="narrow"
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void submit()}
            disabled={submitting || (assignment.locked && reason.trim().length < 3)}
          >
            {submitting ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <Field label="السعر الحالي">
        <TextInput className="input-amount" value={assignment.current} readOnly dir="ltr" />
      </Field>
      <Field label="السعر الجديد" required error={fieldErrors.pricePerPerson}>
        <TextInput
          className="input-amount"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          dir="ltr"
          inputMode="decimal"
          latinDigits
        />
      </Field>
      {assignment.locked ? (
        <div className="alert warning">
          السعر الجديد يُطبَّق فوراً على كل المعتمرين الحاليين لهذا المندوب في الرحلة (
          {assignment.pilgrimCount}). السعر القديم يبقى محفوظاً في سجل التدقيق.
        </div>
      ) : null}
      <Field
        label="سبب التعديل"
        required={assignment.locked}
        error={fieldErrors.reason}
        hint={assignment.locked ? 'إلزامي — 3 أحرف على الأقل' : 'اختياري'}
      >
        <textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
    </Modal>
  );
};
