import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, api, errorMessage, postForm } from '../../api/client';
import type { Paginated, PilgrimDetail, Trip, TripDetail } from '../../api/types';
import { useAsync, validationMessages } from '../../lib/hooks';
import { tripStatusHint, tripStatusLabel } from '../../lib/format';
import {
  Breadcrumbs,
  Field,
  Icon,
  PageHeader,
  SelectInput,
  Skeleton,
  TextInput,
} from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { DocumentPicker } from '../../components/DocumentPicker';

interface FormState {
  name: string;
  passportNumber: string;
  nationalId: string;
  birthDate: string;
  job: string;
  notes: string;
  delegateId: string;
  tripId: string;
}

const empty: FormState = {
  name: '',
  passportNumber: '',
  nationalId: '',
  birthDate: '',
  job: '',
  notes: '',
  delegateId: '',
  tripId: '',
};

/** Inline error for a piece of reference data, with a retry button. */
const InlineLoadError = ({
  error,
  fallback,
  onRetry,
}: {
  error: unknown;
  fallback: string;
  onRetry: () => void;
}) => (
  <div className="alert error row between">
    {/* API errors carry an Arabic message; network failures do not. */}
    <span>{error instanceof ApiError ? error.message : `${fallback} — تحقق من الاتصال ثم أعد المحاولة`}</span>
    <button type="button" className="btn secondary sm" onClick={onRetry}>
      <Icon name="refresh" size={14} /> إعادة المحاولة
    </button>
  </div>
);

/**
 * Add / edit a pilgrim. The form renders immediately in every mode; only the
 * pieces that depend on reference data show a skeleton or a disabled state.
 *
 *   Contextual  /delegates/:delegateId/trips/:tripId/pilgrims/new|:id/edit
 *               delegate + trip come from the URL; one trip request supplies
 *               their names, the trip rules and the assigned delegates.
 *   Generic     /pilgrims/new — choose a trip (list loaded in the background),
 *               then one of the delegates assigned to it.
 *               /pilgrims/:id/edit — the pilgrim, then its trip.
 */
export const PilgrimFormPage = () => {
  const { id, delegateId: ctxDelegateId, tripId: ctxTripId } = useParams();
  const inContext = Boolean(ctxDelegateId && ctxTripId);
  const workspace = inContext ? `/delegates/${ctxDelegateId}/trips/${ctxTripId}/pilgrims` : null;
  const isEdit = Boolean(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState<FormState>({
    ...empty,
    tripId: ctxTripId ?? params.get('tripId') ?? '',
    delegateId: ctxDelegateId ?? params.get('delegateId') ?? '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // Create only: the passport image is required, the personal photo optional.
  const [passportImage, setPassportImage] = useState<File | null>(null);
  const [personalPhoto, setPersonalPhoto] = useState<File | null>(null);

  // Edit: the pilgrim itself. Independent of the trip request below, so in
  // contextual edit both load in parallel.
  const pilgrim = useAsync<PilgrimDetail | null>(
    (signal) => (id ? api.get<PilgrimDetail>(`/pilgrims/${id}`, undefined, signal) : Promise.resolve(null)),
    [id],
  );
  // Copy the loaded pilgrim into the form once (state adjusted during render,
  // keyed by pilgrim id, instead of an effect).
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const p = pilgrim.data;
  if (p && hydratedId !== p.id) {
    setHydratedId(p.id);
    setForm({
      name: p.name,
      passportNumber: p.passportNumber,
      nationalId: p.nationalId ?? '',
      birthDate: p.birthDate ? p.birthDate.slice(0, 10) : '',
      job: p.job ?? '',
      notes: p.notes ?? '',
      delegateId: p.delegate.id,
      tripId: p.trip?.id ?? '',
    });
  }

  // Generic add only: the trips to choose from.
  const needsTripList = !isEdit && !inContext;
  const trips = useAsync<Paginated<Trip> | null>(
    (signal) =>
      needsTripList ? api.get<Paginated<Trip>>('/trips', { pageSize: 200 }, signal) : Promise.resolve(null),
    [needsTripList],
  );

  // The selected / contextual trip: name, status rules and assigned delegates.
  const tripId = ctxTripId ?? form.tripId;
  const trip = useAsync<TripDetail | null>(
    (signal) => (tripId ? api.get<TripDetail>(`/trips/${tripId}`, undefined, signal) : Promise.resolve(null)),
    [tripId],
  );

  const assignments = trip.data?.delegates ?? [];
  const delegateOptions = assignments.filter(
    (row) => row.delegate.status === 'ACTIVE' || (isEdit && row.delegate.id === form.delegateId),
  );
  const ctxAssignment = inContext ? assignments.find((row) => row.delegate.id === ctxDelegateId) : undefined;

  // Generic add: a delegate that is not an active member of the chosen trip
  // (e.g. after changing the trip) counts as not selected.
  const delegateId =
    inContext || isEdit || !trip.data || delegateOptions.some((row) => row.delegate.id === form.delegateId)
      ? form.delegateId
      : '';

  // Problems the API would reject anyway, shown before the user types.
  const blocker: string | null = (() => {
    if (!trip.data) return null;
    if (!isEdit && !trip.data.capabilities.canAddPilgrims) {
      return `الرحلة ${tripStatusLabel[trip.data.status]}: ${tripStatusHint[trip.data.status]}`;
    }
    if (isEdit && !trip.data.capabilities.canEditPilgrims) return tripStatusHint[trip.data.status];
    if (inContext && !isEdit) {
      if (!ctxAssignment) return 'هذا المندوب غير مسند إلى هذه الرحلة';
      if (ctxAssignment.delegate.status !== 'ACTIVE') return 'المندوب موقوف، لا يمكن إضافة معتمرين له';
    }
    return null;
  })();

  // Changing the delegate is a manifest change: blocked once the list is closed.
  const delegateLocked = trip.data ? !trip.data.capabilities.canChangeManifest : false;
  const waitingForPilgrim = isEdit && !pilgrim.data;

  const set =
    (key: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async () => {
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      const payload = {
        name: form.name.trim(),
        passportNumber: form.passportNumber.trim(),
        nationalId: form.nationalId.trim() || undefined,
        birthDate: form.birthDate || undefined,
        job: form.job.trim() || undefined,
        notes: form.notes.trim() || undefined,
        delegateId,
      };
      if (isEdit) {
        await api.patch(`/pilgrims/${id}`, payload);
        toast.success('تم تحديث بيانات المعتمر');
        // A delegate change moves the pilgrim to that delegate's workspace.
        navigate(
          inContext
            ? `/delegates/${delegateId}/trips/${form.tripId}/pilgrims/${id}`
            : `/pilgrims/${id}`,
        );
      } else {
        // One multipart request: the pilgrim and its documents are created together.
        const body = new FormData();
        for (const [key, value] of Object.entries({ ...payload, tripId: form.tripId })) {
          if (value) body.append(key, value);
        }
        if (passportImage) body.append('passportImage', passportImage);
        if (personalPhoto) body.append('personalPhoto', personalPhoto);
        const created = await postForm<PilgrimDetail>('/pilgrims', body);
        toast.success('تمت إضافة المعتمر بنجاح');
        navigate(workspace ?? `/pilgrims/${created.id}`);
      }
    } catch (err) {
      setFieldErrors(validationMessages(err));
      setError(errorMessage(err, 'تعذر حفظ بيانات المعتمر'));
    } finally {
      setSubmitting(false);
    }
  };

  const cancelPath = isEdit
    ? workspace
      ? `${workspace}/${id}`
      : `/pilgrims/${id}`
    : (workspace ?? '/pilgrims');

  const ctxDelegateName = ctxAssignment?.delegate.name;
  const ctxTripName = trip.data?.name;
  const contextValue = (value: string | undefined): ReactNode =>
    value ?? (trip.loading ? <Skeleton width={120} height={14} /> : '—');

  const canSubmit =
    !submitting &&
    !waitingForPilgrim &&
    !blocker &&
    Boolean(form.name.trim() && form.passportNumber.trim() && form.tripId && delegateId) &&
    (isEdit || Boolean(passportImage)) &&
    (!inContext || Boolean(trip.data));

  return (
    <div className="page">
      {workspace ? (
        <Breadcrumbs
          items={[
            { label: 'المناديب', to: '/delegates' },
            { label: ctxDelegateName ?? 'المندوب', to: `/delegates/${ctxDelegateId}` },
            { label: ctxTripName ?? 'الرحلة', to: workspace },
            { label: isEdit ? 'تعديل معتمر' : 'إضافة معتمر' },
          ]}
        />
      ) : null}
      <PageHeader
        title={isEdit ? 'تعديل بيانات معتمر' : 'إضافة معتمر جديد'}
        subtitle={
          inContext
            ? undefined
            : isEdit
              ? 'تعديل البيانات الأساسية للمعتمر'
              : 'اختر الرحلة ثم المندوب المسند إليها'
        }
        actions={
          <Link className="btn secondary" to={cancelPath}>
            إلغاء
          </Link>
        }
      />

      <div className="stack tight" style={{ maxWidth: 860 }}>
        {trip.error ? (
          <InlineLoadError error={trip.error} fallback="تعذر تحميل بيانات الرحلة" onRetry={trip.reload} />
        ) : null}
        {pilgrim.error ? (
          <InlineLoadError error={pilgrim.error} fallback="تعذر تحميل بيانات المعتمر" onRetry={pilgrim.reload} />
        ) : null}
        {blocker ? <div className="alert warning">{blocker}</div> : null}
      </div>

      <div className="card" style={{ maxWidth: 860 }}>
        <div className="card-body">
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) void submit();
            }}
          >
            {error ? <div className="alert error">{error}</div> : null}
            {waitingForPilgrim && pilgrim.loading ? (
              <div className="muted small">جارٍ تحميل بيانات المعتمر...</div>
            ) : null}

            <fieldset disabled={waitingForPilgrim} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <div className="stack">
                <section>
                  <div className="section-title">
                    <Icon name="user" size={16} /> البيانات الأساسية
                  </div>
                  <div className="form-grid">
                    <Field label="اسم المعتمر" required error={fieldErrors.name}>
                      <TextInput value={form.name} onChange={set('name')} autoFocus={!isEdit} />
                    </Field>
                    <Field
                      label="رقم جواز السفر"
                      required
                      error={fieldErrors.passportNumber}
                      hint="حروف وأرقام فقط"
                    >
                      <TextInput
                        value={form.passportNumber}
                        onChange={set('passportNumber')}
                        dir="ltr"
                        placeholder="A1234567"
                      />
                    </Field>
                    <Field label="رقم الهوية / الرقم القومي" error={fieldErrors.nationalId}>
                      <TextInput
                        value={form.nationalId}
                        onChange={set('nationalId')}
                        dir="ltr"
                        inputMode="numeric"
                      />
                    </Field>
                    <Field label="تاريخ الميلاد" error={fieldErrors.birthDate}>
                      <TextInput type="date" value={form.birthDate} onChange={set('birthDate')} dir="ltr" />
                    </Field>
                    <Field label="الوظيفة" error={fieldErrors.job}>
                      <TextInput value={form.job} onChange={set('job')} />
                    </Field>
                  </div>
                </section>

                {inContext && !isEdit ? (
                  <section>
                    <div className="section-title">
                      <Icon name="bus" size={16} /> الرحلة والمندوب
                    </div>
                    {/* Fixed by the page context; not editable here. */}
                    <dl className="kv">
                      <dt>الرحلة</dt>
                      <dd>
                        <strong>{contextValue(ctxTripName)}</strong>
                      </dd>
                      <dt>المندوب</dt>
                      <dd>
                        <strong>{contextValue(ctxDelegateName)}</strong>
                      </dd>
                    </dl>
                  </section>
                ) : (
                  <section>
                    <div className="section-title">
                      <Icon name="bus" size={16} /> الرحلة والمندوب
                    </div>
                    {trips.error ? (
                      <InlineLoadError error={trips.error} fallback="تعذر تحميل الرحلات" onRetry={trips.reload} />
                    ) : null}
                    <div className="form-grid">
                      {!isEdit ? (
                        <Field
                          label="الرحلة"
                          required
                          error={fieldErrors.tripId}
                          hint={trips.loading ? 'جارٍ تحميل الرحلات...' : 'الرحلات المفتوحة فقط'}
                        >
                          <SelectInput value={form.tripId} onChange={set('tripId')} disabled={trips.loading}>
                            <option value="">{trips.loading ? 'جارٍ التحميل...' : 'اختر الرحلة'}</option>
                            {(trips.data?.items ?? [])
                              .filter((t) => t.capabilities?.canAddPilgrims || t.id === form.tripId)
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                          </SelectInput>
                        </Field>
                      ) : null}

                      <Field
                        label="المندوب"
                        required
                        error={fieldErrors.delegateId}
                        hint={
                          !tripId
                            ? 'اختر الرحلة أولاً'
                            : trip.loading
                              ? 'جارٍ تحميل مناديب الرحلة...'
                              : isEdit && delegateLocked
                                ? 'قائمة الرحلة مغلقة: لا يمكن نقل المعتمر إلى مندوب آخر'
                                : trip.data && delegateOptions.length === 0
                                  ? 'لا يوجد مناديب نشطون في هذه الرحلة — أضف مندوباً من صفحة الرحلة'
                                  : 'المناديب المسندون لهذه الرحلة فقط'
                        }
                      >
                        <SelectInput
                          value={delegateId}
                          onChange={set('delegateId')}
                          disabled={!tripId || trip.loading || !trip.data || (isEdit && delegateLocked)}
                        >
                          <option value="">{trip.loading ? 'جارٍ التحميل...' : 'اختر المندوب'}</option>
                          {delegateOptions.map((row) => (
                            <option key={row.delegate.id} value={row.delegate.id}>
                              {row.delegate.name} — {row.delegate.phone}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                    </div>
                  </section>
                )}

                <section>
                  <div className="section-title">
                    <Icon name="file" size={16} /> المستندات
                  </div>
                  {isEdit ? (
                    <p className="muted small" style={{ margin: 0 }}>
                      تُدار المستندات من ملف المعتمر: يمكن استبدال صورة الجواز أو إضافة الصورة الشخصية هناك.
                    </p>
                  ) : (
                    <div className="form-grid">
                      <DocumentPicker
                        name="passportImage"
                        label="صورة جواز السفر"
                        required
                        file={passportImage}
                        onChange={(file) => {
                          setPassportImage(file);
                          setFieldErrors((current) => ({ ...current, passportImage: '' }));
                        }}
                        error={fieldErrors.passportImage}
                      />
                      <DocumentPicker
                        name="personalPhoto"
                        label="الصورة الشخصية"
                        file={personalPhoto}
                        onChange={(file) => {
                          setPersonalPhoto(file);
                          setFieldErrors((current) => ({ ...current, personalPhoto: '' }));
                        }}
                        error={fieldErrors.personalPhoto}
                      />
                    </div>
                  )}
                </section>

                <section>
                  <div className="section-title">
                    <Icon name="edit" size={16} /> ملاحظات
                  </div>
                  <div className="form-grid">
                    <Field label="ملاحظات" className="full" error={fieldErrors.notes}>
                      <textarea className="textarea" value={form.notes} onChange={set('notes')} />
                    </Field>
                  </div>
                </section>
              </div>
            </fieldset>

            {isEdit ? (
              <div className="alert info">
                لنقل المعتمر إلى رحلة أخرى استخدم زر «نقل معتمر» في ملف المعتمر، ولتغيير المندوب
                اختر المندوب الجديد هنا (يجب أن يكون مسنداً إلى نفس الرحلة).
              </div>
            ) : null}

            <div className="form-actions">
              <button type="submit" className="btn" disabled={!canSubmit}>
                {submitting ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة المعتمر'}
              </button>
              <Link className="btn secondary" to={cancelPath}>
                رجوع
              </Link>
              {!isEdit && !passportImage ? (
                <span className="muted small">أرفق صورة جواز السفر لإضافة المعتمر</span>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
