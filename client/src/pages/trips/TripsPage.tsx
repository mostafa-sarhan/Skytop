import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { FlightType, Paginated, Trip, TripStatus } from '../../api/types';
import { useAsync, useListState, validationMessages } from '../../lib/hooks';
import {
  flightTypeLabel,
  formatDate,
  tripPhaseLabel,
  tripStatusLabel,
  tripStatusTone,
} from '../../lib/format';
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  SelectInput,
  TextInput,
  useDebouncedValue,
} from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

/** Create / edit the trip's basic data. Status is changed from the trip page. */
export const TripFormModal = ({
  trip,
  onClose,
  onSaved,
}: {
  trip?: Trip | null;
  onClose: () => void;
  onSaved: (saved: Trip) => void;
}) => {
  const toast = useToast();
  const [form, setForm] = useState({
    name: trip?.name ?? '',
    departureDate: trip ? trip.departureDate.slice(0, 10) : '',
    returnDate: trip ? trip.returnDate.slice(0, 10) : '',
    flightType: (trip?.flightType ?? 'DIRECT') as FlightType,
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const set =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  // ISO dates compare correctly as strings.
  const datesInvalid = Boolean(form.departureDate && form.returnDate && form.returnDate < form.departureDate);

  const submit = async () => {
    setError('');
    setFieldErrors({});
    if (datesInvalid) {
      setFieldErrors({ returnDate: 'تاريخ العودة لا يمكن أن يكون قبل تاريخ السفر' });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        departureDate: form.departureDate,
        returnDate: form.returnDate,
        flightType: form.flightType,
      };
      const saved = trip
        ? await api.patch<Trip>(`/trips/${trip.id}`, payload)
        : await api.post<Trip>('/trips', payload);
      toast.success(trip ? 'تم تحديث الرحلة' : 'تمت إضافة الرحلة');
      onSaved(saved);
      onClose();
    } catch (err) {
      setFieldErrors(validationMessages(err));
      setError(errorMessage(err, 'تعذر حفظ الرحلة'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={trip ? 'تعديل بيانات الرحلة' : 'إضافة رحلة جديدة'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void submit()}
            disabled={submitting || !form.name.trim() || !form.departureDate || !form.returnDate}
          >
            {submitting ? 'جارٍ الحفظ...' : trip ? 'حفظ' : 'إضافة الرحلة'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <Field label="اسم الرحلة" required error={fieldErrors.name}>
        <TextInput value={form.name} onChange={set('name')} placeholder="مثال: رحلة 26 أكتوبر" />
      </Field>
      <div className="form-grid">
        <Field label="تاريخ السفر" required error={fieldErrors.departureDate}>
          <TextInput type="date" value={form.departureDate} onChange={set('departureDate')} dir="ltr" />
        </Field>
        <Field
          label="تاريخ العودة"
          required
          error={
            fieldErrors.returnDate ?? (datesInvalid ? 'تاريخ العودة لا يمكن أن يكون قبل تاريخ السفر' : undefined)
          }
        >
          <TextInput
            type="date"
            value={form.returnDate}
            onChange={set('returnDate')}
            min={form.departureDate || undefined}
            dir="ltr"
          />
        </Field>
        <Field label="نوع الطيران" required error={fieldErrors.flightType}>
          <SelectInput value={form.flightType} onChange={set('flightType')}>
            <option value="DIRECT">{flightTypeLabel.DIRECT}</option>
            <option value="INDIRECT">{flightTypeLabel.INDIRECT}</option>
          </SelectInput>
        </Field>
      </div>
    </Modal>
  );
};

/**
 * Operational trip list. Trips that have not finished come first (soonest
 * departure first), finished trips after them — ordering is done by the API.
 */
export const TripsPage = () => {
  const list = useListState();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'' | TripStatus>('');
  // `?new=1` (dashboard quick action) opens the create form directly.
  const [params, setParams] = useSearchParams();
  const [modalOpen, setModalOpenState] = useState(() => params.get('new') === '1');
  const setModalOpen = (open: boolean) => {
    setModalOpenState(open);
    if (!open && params.has('new')) setParams({}, { replace: true });
  };
  const debouncedStatus = useDebouncedValue(status);

  const { data, loading, error, reload } = useAsync<Paginated<Trip>>(
    (signal) =>
      api.get<Paginated<Trip>>(
        '/trips',
        {
          page: list.page,
          pageSize: list.pageSize,
          search: list.debouncedSearch || undefined,
          status: debouncedStatus || undefined,
        },
        signal,
      ),
    [list.page, list.pageSize, list.debouncedSearch, debouncedStatus],
  );

  return (
    <div className="page">
      <PageHeader
        title="الرحلات"
        subtitle="الرحلات الحالية والقادمة أولاً، ثم الرحلات المنتهية"
        actions={
          <button type="button" className="btn" onClick={() => setModalOpen(true)}>
            <Icon name="plus" size={15} /> إضافة رحلة
          </button>
        }
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="filters">
            <Field label="بحث">
              <TextInput
                className="input-search"
                value={list.search}
                onChange={(event) => list.setSearch(event.target.value)}
                placeholder="اسم الرحلة"
              />
            </Field>
            <Field label="الحالة">
              <SelectInput
                value={status}
                onChange={(event) => setStatus(event.target.value as TripStatus | '')}
              >
                <option value="">الكل</option>
                {(Object.keys(tripStatusLabel) as TripStatus[]).map((value) => (
                  <option key={value} value={value}>
                    {tripStatusLabel[value]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <button type="button" className="btn secondary" onClick={reload}>
              <Icon name="refresh" size={15} /> تحديث
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <LoadingBlock /> : null}
        {error ? <EmptyState title="تعذر تحميل قائمة الرحلات" /> : null}
        {data ? (
          data.items.length === 0 ? (
            <EmptyState
              title={list.debouncedSearch || debouncedStatus ? 'لا توجد رحلات مطابقة' : 'لا توجد رحلات بعد'}
              action={
                <button type="button" className="btn" onClick={() => setModalOpen(true)}>
                  إضافة رحلة
                </button>
              }
            />
          ) : (
            <>
              <div className="table-wrap">
                <table className="data stack-on-phone stack-on-tablet">
                  <thead>
                    <tr>
                      <th>اسم الرحلة</th>
                      <th>تاريخ السفر</th>
                      <th>تاريخ العودة</th>
                      <th>نوع الطيران</th>
                      <th>الحالة</th>
                      <th className="num">عدد المناديب</th>
                      <th className="num">المعتمرون النشطون</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((trip) => (
                      <tr key={trip.id} style={trip.phase === 'FINISHED' ? { opacity: 0.75 } : undefined}>
                        <td className="primary-cell">
                          <Link to={`/trips/${trip.id}`}>
                            <strong>{trip.name}</strong>
                          </Link>
                        </td>
                        <td className="mono">{formatDate(trip.departureDate)}</td>
                        <td className="mono">{formatDate(trip.returnDate)}</td>
                        <td>{flightTypeLabel[trip.flightType]}</td>
                        <td>
                          <Badge tone={tripStatusTone(trip.status)}>{tripStatusLabel[trip.status]}</Badge>
                          {trip.phase ? <div className="muted small">{tripPhaseLabel[trip.phase]}</div> : null}
                        </td>
                        <td className="num mono">{trip.delegateCount ?? 0}</td>
                        <td className="num mono">{trip.pilgrimCount ?? 0}</td>
                        <td>
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => navigate(`/trips/${trip.id}`)}
                          >
                            <Icon name="eye" size={14} /> فتح الرحلة
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...data.meta} onPage={list.setPage} />
            </>
          )
        ) : null}
      </div>

      {modalOpen ? (
        <TripFormModal
          onClose={() => setModalOpen(false)}
          onSaved={(saved) => navigate(`/trips/${saved.id}`)}
        />
      ) : null}
    </div>
  );
};
