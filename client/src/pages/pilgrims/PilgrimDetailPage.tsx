import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { PilgrimDetail } from '../../api/types';
import { useAsync } from '../../lib/hooks';
import {
  documentStatusLabel,
  formatDate,
  formatDateTime,
  tripStatusLabel,
  tripStatusTone,
} from '../../lib/format';
import { Badge, Breadcrumbs, EmptyState, Icon, LoadingBlock, PageHeader } from '../../ui/primitives';
import { PilgrimDocumentCard } from '../../components/PilgrimDocumentCard';
import { CancelPilgrimModal, TransferModal } from '../../components/PilgrimModals';

/** Where the global list sends people from, so «رجوع» keeps its filters. */
export interface PilgrimListOrigin {
  from?: string;
}

/**
 * ملف المعتمر. Opened either from the global list (/pilgrims/:id) or from the
 * delegate → trip workspace (/delegates/:delegateId/trips/:tripId/pilgrims/:id);
 * breadcrumbs and «رجوع» follow the way the page was opened.
 */
export const PilgrimDetailPage = () => {
  const { id = '', delegateId } = useParams();
  const inContext = Boolean(delegateId);
  const navigate = useNavigate();
  const location = useLocation();
  const listOrigin = (location.state as PilgrimListOrigin | null)?.from ?? '/pilgrims';
  const [transferring, setTransferring] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const pilgrim = useAsync<PilgrimDetail>(
    (signal) => api.get<PilgrimDetail>(`/pilgrims/${id}`, undefined, signal),
    [id],
  );

  // "المستندات" action in the workspace links to #documents.
  const loaded = Boolean(pilgrim.data);
  useEffect(() => {
    if (loaded && location.hash === '#documents') {
      document.getElementById('documents')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loaded, location.hash]);

  if (pilgrim.loading && !pilgrim.data)
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  if (pilgrim.error || !pilgrim.data)
    return (
      <div className="page">
        <EmptyState
          title="تعذر تحميل ملف المعتمر"
          action={
            <button type="button" className="btn secondary" onClick={() => navigate(listOrigin)}>
              رجوع للمعتمرين
            </button>
          }
        />
      </div>
    );

  const data = pilgrim.data;
  const trip = data.trip;
  const docs = new Map(data.documents.map((doc) => [doc.type, doc]));
  // The workspace always follows the pilgrim's CURRENT delegate + trip.
  const workspace = trip ? `/delegates/${data.delegate.id}/trips/${trip.id}/pilgrims` : null;
  const editPath = inContext && workspace ? `${workspace}/${id}/edit` : `/pilgrims/${id}/edit`;
  const cancelled = data.status === 'CANCELLED';
  const caps = data.tripCapabilities;
  // Trip rules come from the API: CLOSED keeps data/document edits and
  // exclusions but blocks transfers; COMPLETED is read-only.
  const canEdit = !cancelled && caps.canEditPilgrims;
  const canTransfer = !cancelled && caps.canChangeManifest;
  const canCancel = !cancelled && caps.canCancelPilgrims;
  const backTo = inContext && workspace ? workspace : listOrigin;
  const readOnlyReason = cancelled
    ? 'المعتمر مستبعد: المستندات محفوظة للعرض فقط'
    : !caps.canEditPilgrims
      ? 'الرحلة مكتملة: المستندات للعرض فقط'
      : undefined;

  return (
    <div className="page">
      <Breadcrumbs
        items={
          inContext && workspace
            ? [
                { label: 'المناديب', to: '/delegates' },
                { label: data.delegate.name, to: `/delegates/${data.delegate.id}` },
                { label: trip?.name ?? 'الرحلة', to: workspace },
                { label: data.name },
              ]
            : [{ label: 'المعتمرون', to: listOrigin }, { label: data.name }]
        }
      />
      <PageHeader
        title={data.name}
        subtitle={`رقم جواز السفر: ${data.passportNumber}`}
        actions={
          <>
            {canEdit ? (
              <Link className="btn" to={editPath}>
                <Icon name="edit" size={15} /> تعديل البيانات
              </Link>
            ) : null}
            {canTransfer ? (
              <button type="button" className="btn secondary" onClick={() => setTransferring(true)}>
                <Icon name="refresh" size={15} /> نقل إلى رحلة أخرى
              </button>
            ) : null}
            {canCancel ? (
              <button type="button" className="btn ghost danger-text" onClick={() => setCancelling(true)}>
                استبعاد
              </button>
            ) : null}
          </>
        }
      />

      <div className="row" style={{ marginBottom: 16 }}>
        {cancelled ? <Badge tone="danger">مستبعد</Badge> : <Badge tone="success">نشط</Badge>}
        <Badge tone={data.documentStatus === 'COMPLETE' ? 'success' : 'warning'}>
          المستندات: {documentStatusLabel[data.documentStatus]}
        </Badge>
      </div>

      {cancelled ? (
        <div className="alert error cancel-banner" style={{ marginBottom: 16 }}>
          <div>
            <strong>هذا المعتمر مستبعد</strong>
            <dl className="kv compact">
              <dt>تاريخ الاستبعاد</dt>
              <dd className="mono">{data.cancelledAt ? formatDateTime(data.cancelledAt) : '—'}</dd>
              <dt>السبب</dt>
              <dd>{data.cancelReason ?? '—'}</dd>
              <dt>بواسطة</dt>
              <dd>{data.cancelledBy?.fullName ?? '—'}</dd>
            </dl>
            <span className="small">
              لا يُحتسب ضمن المعتمرين النشطين ولا ضمن المطلوب من المندوب. بياناته ومستنداته وسجل نقله
              محفوظة للعرض فقط.
            </span>
          </div>
        </div>
      ) : trip && trip.status === 'COMPLETED' ? (
        <div className="alert info" style={{ marginBottom: 16 }}>
          الرحلة مكتملة: ملف المعتمر متاح للعرض والتقارير فقط.
        </div>
      ) : trip && trip.status === 'CLOSED' ? (
        <div className="alert warning" style={{ marginBottom: 16 }}>
          قائمة الرحلة مغلقة: يمكن تعديل البيانات والمستندات والاستبعاد، ولا يمكن نقل المعتمر إلى رحلة أو مندوب
          آخر.
        </div>
      ) : null}

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3>البيانات الأساسية</h3>
          </div>
          <div className="card-body">
            <dl className="kv">
              <dt>الاسم</dt>
              <dd>{data.name}</dd>
              <dt>رقم جواز السفر</dt>
              <dd className="mono">{data.passportNumber}</dd>
              <dt>الرقم القومي</dt>
              <dd className="mono">{data.nationalId || '—'}</dd>
              <dt>تاريخ الميلاد</dt>
              <dd className="mono">{data.birthDate ? formatDate(data.birthDate) : '—'}</dd>
              <dt>الوظيفة</dt>
              <dd>{data.job || '—'}</dd>
              <dt>الملاحظات</dt>
              <dd className="pre-wrap">{data.notes || '—'}</dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>الرحلة والمندوب</h3>
          </div>
          <div className="card-body">
            <dl className="kv">
              <dt>الرحلة</dt>
              <dd>
                {trip ? (
                  <>
                    <Link to={`/trips/${trip.id}`}>
                      <strong>{trip.name}</strong>
                    </Link>{' '}
                    <Badge tone={tripStatusTone(trip.status)}>{tripStatusLabel[trip.status]}</Badge>
                  </>
                ) : (
                  '—'
                )}
              </dd>
              <dt>السفر / العودة</dt>
              <dd className="mono">
                {trip?.departureDate ? formatDate(trip.departureDate) : '—'} —{' '}
                {trip?.returnDate ? formatDate(trip.returnDate) : '—'}
              </dd>
              <dt>المندوب</dt>
              <dd>
                <Link to={`/delegates/${data.delegate.id}`}>
                  <strong>{data.delegate.name}</strong>
                </Link>
                {data.delegate.phone ? (
                  <div className="mono muted small" dir="ltr" style={{ textAlign: 'right' }}>
                    {data.delegate.phone}
                  </div>
                ) : null}
              </dd>
              <dt>تاريخ التسجيل</dt>
              <dd className="mono">{formatDate(data.createdAt)}</dd>
            </dl>
            {workspace && !inContext ? (
              <Link className="btn ghost sm" to={workspace}>
                <Icon name="users" size={14} /> معتمرو المندوب في هذه الرحلة
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div id="documents" className="section-block">
        <div className="section-heading">
          <h2>المستندات</h2>
          <Badge tone={data.documentStatus === 'COMPLETE' ? 'success' : 'warning'}>
            {documentStatusLabel[data.documentStatus]}
          </Badge>
        </div>
        <div className="grid cols-2">
          <PilgrimDocumentCard
            pilgrimId={id}
            type="PASSPORT_IMAGE"
            document={docs.get('PASSPORT_IMAGE')}
            canEdit={canEdit}
            readOnlyReason={readOnlyReason}
            onChanged={pilgrim.reload}
          />
          <PilgrimDocumentCard
            pilgrimId={id}
            type="PERSONAL_PHOTO"
            document={docs.get('PERSONAL_PHOTO')}
            canEdit={canEdit}
            readOnlyReason={readOnlyReason}
            onChanged={pilgrim.reload}
          />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3>سجل النقل</h3>
          {data.transfers.length > 0 ? <span className="muted small">{data.transfers.length} نقل</span> : null}
        </div>
        <div className="card-body flush">
          {data.transfers.length === 0 ? (
            <EmptyState icon="refresh" title="لم يُنقل هذا المعتمر بين الرحلات" />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>من رحلة</th>
                    <th>إلى رحلة</th>
                    <th>بواسطة</th>
                    <th className="wrap">السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transfers.map((transfer) => (
                    <tr key={transfer.id}>
                      <td className="mono">{formatDateTime(transfer.createdAt)}</td>
                      <td>{transfer.fromTrip?.name ?? '—'}</td>
                      <td>
                        <strong>{transfer.toTrip.name}</strong>
                      </td>
                      <td>{transfer.performedBy.fullName}</td>
                      <td className="wrap">{transfer.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" className="btn secondary" onClick={() => navigate(backTo)}>
          <Icon name="arrow-right" size={15} />{' '}
          {inContext ? 'رجوع لمعتمري المندوب في الرحلة' : 'رجوع لقائمة المعتمرين'}
        </button>
      </div>

      {transferring ? (
        <TransferModal
          pilgrim={data}
          onClose={() => setTransferring(false)}
          onDone={(toTripId) => {
            // In the workspace context the pilgrim now lives in the new trip.
            if (inContext) navigate(`/delegates/${data.delegate.id}/trips/${toTripId}/pilgrims/${id}`, { replace: true });
            pilgrim.reload();
          }}
        />
      ) : null}
      {cancelling && trip ? (
        <CancelPilgrimModal
          pilgrim={data}
          tripName={trip.name}
          onClose={() => setCancelling(false)}
          onDone={pilgrim.reload}
        />
      ) : null}
    </div>
  );
};
