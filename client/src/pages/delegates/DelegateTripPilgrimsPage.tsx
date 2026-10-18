import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { DelegateTripPilgrim, DelegateTripPilgrims, PilgrimStatus } from '../../api/types';
import { useAsync, validationMessages } from '../../lib/hooks';
import {
  documentStatusLabel,
  flightTypeLabel,
  formatDate,
  formatDateTime,
  tripStatusHint,
  tripStatusLabel,
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
  Tabs,
  TextInput,
} from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { TransferModal } from '../pilgrims/PilgrimDetailPage';

/** استبعاد: confirmation with a required reason. Nothing is deleted. */
const CancelPilgrimModal = ({
  pilgrim,
  tripName,
  onClose,
  onDone,
}: {
  pilgrim: DelegateTripPilgrim;
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

/**
 * Main operational workspace: the pilgrims of ONE delegate in ONE trip.
 * The list is filtered on the server (/delegates/:id/trips/:tripId/pilgrims);
 * new pilgrims created here are bound to this delegate and trip.
 */
export const DelegateTripPilgrimsPage = () => {
  const { delegateId = '', tripId = '' } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<PilgrimStatus>('ACTIVE');
  const [search, setSearch] = useState('');
  const [docFilter, setDocFilter] = useState<'ALL' | 'INCOMPLETE'>('ALL');
  const [transferring, setTransferring] = useState<DelegateTripPilgrim | null>(null);
  const [cancelling, setCancelling] = useState<DelegateTripPilgrim | null>(null);

  const { data, loading, error, reload } = useAsync<DelegateTripPilgrims>(
    (signal) =>
      api.get<DelegateTripPilgrims>(
        `/delegates/${delegateId}/trips/${tripId}/pilgrims`,
        { status: view },
        signal,
      ),
    [delegateId, tripId, view],
  );

  const base = `/delegates/${delegateId}/trips/${tripId}/pilgrims`;

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.pilgrims ?? []).filter((p) => {
      if (view === 'ACTIVE' && docFilter === 'INCOMPLETE' && p.documentStatus === 'COMPLETE') return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.passportNumber.toLowerCase().includes(term) ||
        (p.nationalId ?? '').includes(term)
      );
    });
  }, [data, search, docFilter, view]);

  if (loading && !data)
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  if (error || !data)
    return (
      <div className="page">
        <Breadcrumbs
          items={[
            { label: 'المناديب', to: '/delegates' },
            { label: 'المندوب', to: `/delegates/${delegateId}` },
            { label: 'الرحلة' },
          ]}
        />
        <EmptyState
          title="تعذر تحميل معتمري المندوب في هذه الرحلة"
          description="تأكد أن المندوب مسند إلى هذه الرحلة"
          action={
            <Link className="btn secondary" to={`/delegates/${delegateId}`}>
              رجوع للمندوب
            </Link>
          }
        />
      </div>
    );

  const { delegate, trip, summary } = data;
  // Status rules come from the API (tripRules.ts); the UI only hides actions.
  const can = data.capabilities;
  const canAdd = can.canAddPilgrims && delegate.status === 'ACTIVE';
  const canCancel = can.canCancelPilgrims;
  const canEdit = can.canEditPilgrims;
  const canTransfer = can.canChangeManifest;
  const showingCancelled = data.status === 'CANCELLED';

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: 'المناديب', to: '/delegates' },
          { label: delegate.name, to: `/delegates/${delegate.id}` },
          { label: trip.name },
        ]}
      />
      <PageHeader
        title={`معتمرو ${delegate.name} — ${trip.name}`}
        subtitle={`السفر ${formatDate(trip.departureDate)} — العودة ${formatDate(trip.returnDate)} — طيران ${flightTypeLabel[trip.flightType]}`}
        actions={
          <>
            {canAdd ? (
              <Link className="btn" to={`${base}/new`}>
                <Icon name="plus" size={15} /> إضافة معتمر
              </Link>
            ) : null}
            <Link className="btn secondary" to={`/trips/${trip.id}`}>
              <Icon name="bus" size={15} /> صفحة الرحلة
            </Link>
          </>
        }
      />

      <div className="row" style={{ marginBottom: 16 }}>
        <Badge tone="primary">عدد المعتمرين النشطين: {summary.total}</Badge>
        {summary.completeDocuments !== null ? (
          <Badge tone="success">مستندات مكتملة: {summary.completeDocuments}</Badge>
        ) : null}
        {summary.incompleteDocuments !== null ? (
          <Badge tone={summary.incompleteDocuments > 0 ? 'warning' : 'default'}>
            مستندات ناقصة: {summary.incompleteDocuments}
          </Badge>
        ) : null}
        <Badge>حالة الرحلة: {tripStatusLabel[trip.status]}</Badge>
        {delegate.status !== 'ACTIVE' && can.canAddPilgrims ? (
          <Badge tone="warning">المندوب موقوف — لا يمكن إضافة معتمرين</Badge>
        ) : null}
      </div>
      {trip.status !== 'OPEN' ? (
        <div className="alert warning" style={{ marginBottom: 12 }}>
          <strong>{tripStatusLabel[trip.status]}:</strong> {tripStatusHint[trip.status]}
        </div>
      ) : null}

      <Tabs
        items={[
          { id: 'ACTIVE', label: 'النشطون', count: summary.total },
          { id: 'CANCELLED', label: 'المستبعدون', count: summary.cancelled },
        ]}
        active={view}
        onChange={(id) => setView(id as PilgrimStatus)}
      />

      <div className="card" style={{ marginBottom: 16, marginTop: 12 }}>
        <div className="card-body">
          <div className="filters">
            <Field label="بحث">
              <TextInput
                className="input-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="الاسم أو رقم الجواز أو الرقم القومي"
              />
            </Field>
            {!showingCancelled ? (
              <Field label="المستندات">
                <SelectInput
                  value={docFilter}
                  onChange={(event) => setDocFilter(event.target.value as 'ALL' | 'INCOMPLETE')}
                >
                  <option value="ALL">الكل</option>
                  <option value="INCOMPLETE">الناقصة فقط</option>
                </SelectInput>
              </Field>
            ) : null}
            <button type="button" className="btn secondary" onClick={reload}>
              <Icon name="refresh" size={15} /> تحديث
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <LoadingBlock /> : null}
        {!loading && data.pilgrims.length === 0 ? (
          showingCancelled ? (
            <EmptyState title="لا يوجد معتمرون مستبعدون لهذا المندوب في هذه الرحلة" />
          ) : (
            <EmptyState
              title="لا يوجد معتمرون نشطون لهذا المندوب في هذه الرحلة"
              action={
                canAdd ? (
                  <Link className="btn" to={`${base}/new`}>
                    إضافة معتمر
                  </Link>
                ) : undefined
              }
            />
          )
        ) : !loading && rows.length === 0 ? (
          <EmptyState title="لا توجد نتائج مطابقة" />
        ) : !loading && showingCancelled ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="num">م</th>
                  <th>الاسم</th>
                  <th>رقم الجواز</th>
                  <th>الرقم القومي</th>
                  <th>الحالة</th>
                  <th>تاريخ الاستبعاد</th>
                  <th className="wrap">السبب</th>
                  <th>بواسطة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((pilgrim, index) => (
                  <tr key={pilgrim.id}>
                    <td className="num mono">{index + 1}</td>
                    <td>
                      <Link to={`${base}/${pilgrim.id}`}>
                        <strong>{pilgrim.name}</strong>
                      </Link>
                    </td>
                    <td className="mono">{pilgrim.passportNumber}</td>
                    <td className="mono">{pilgrim.nationalId ?? '—'}</td>
                    <td>
                      <Badge tone="danger">مستبعد</Badge>
                    </td>
                    <td className="mono">{pilgrim.cancelledAt ? formatDateTime(pilgrim.cancelledAt) : '—'}</td>
                    <td className="wrap">{pilgrim.cancelReason ?? '—'}</td>
                    <td>{pilgrim.cancelledBy?.fullName ?? '—'}</td>
                    <td>
                      <Link className="btn ghost sm" to={`${base}/${pilgrim.id}`}>
                        <Icon name="eye" size={14} /> عرض
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="num">م</th>
                  <th>الاسم</th>
                  <th>رقم الجواز</th>
                  <th>الرقم القومي</th>
                  <th>تاريخ الميلاد</th>
                  <th>الوظيفة</th>
                  <th>حالة المستندات</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((pilgrim, index) => (
                  <tr key={pilgrim.id}>
                    <td className="num mono">{index + 1}</td>
                    <td>
                      <Link to={`${base}/${pilgrim.id}`}>
                        <strong>{pilgrim.name}</strong>
                      </Link>
                    </td>
                    <td className="mono">{pilgrim.passportNumber}</td>
                    <td className="mono">{pilgrim.nationalId ?? '—'}</td>
                    <td className="mono">{pilgrim.birthDate ? formatDate(pilgrim.birthDate) : '—'}</td>
                    <td>{pilgrim.job ?? '—'}</td>
                    <td>
                      <Badge tone={pilgrim.documentStatus === 'COMPLETE' ? 'success' : 'warning'}>
                        {documentStatusLabel[pilgrim.documentStatus]}
                      </Badge>
                    </td>
                    <td>
                      <div className="row">
                        <Link className="btn ghost sm" to={`${base}/${pilgrim.id}`}>
                          <Icon name="eye" size={14} /> عرض
                        </Link>
                        {canEdit ? (
                          <Link className="btn ghost sm" to={`${base}/${pilgrim.id}/edit`}>
                            <Icon name="edit" size={14} /> تعديل
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => navigate(`${base}/${pilgrim.id}#documents`)}
                        >
                          <Icon name="file" size={14} /> المستندات
                        </button>
                        {canTransfer ? (
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => setTransferring(pilgrim)}
                          >
                            <Icon name="refresh" size={14} /> نقل
                          </button>
                        ) : null}
                        {canCancel ? (
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => setCancelling(pilgrim)}
                          >
                            <Icon name="trash" size={14} /> استبعاد
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {transferring ? (
        <TransferModal
          pilgrim={{
            id: transferring.id,
            name: transferring.name,
            trip: { id: trip.id, name: trip.name },
            delegate: { id: delegate.id },
          }}
          onClose={() => setTransferring(null)}
          onDone={reload}
        />
      ) : null}

      {cancelling ? (
        <CancelPilgrimModal
          pilgrim={cancelling}
          tripName={trip.name}
          onClose={() => setCancelling(null)}
          onDone={reload}
        />
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" className="btn secondary" onClick={() => navigate(`/delegates/${delegate.id}`)}>
          <Icon name="arrow-right" size={15} /> رجوع لرحلات المندوب
        </button>
      </div>
    </div>
  );
};
