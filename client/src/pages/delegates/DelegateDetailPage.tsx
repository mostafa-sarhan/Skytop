import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { DelegateDetail, DelegateTripRow } from '../../api/types';
import { useAsync } from '../../lib/hooks';
import {
  delegateStatusLabel,
  flightTypeLabel,
  formatDate,
  tripStatusLabel,
} from '../../lib/format';
import { Badge, Breadcrumbs, EmptyState, Icon, LoadingBlock, PageHeader } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { DelegateFormModal } from './DelegatesPage';

/**
 * Operational delegate profile: basic data + the delegate's trips. Financial
 * information lives in حسابات المناديب (/accounts/:delegateId).
 */
export const DelegateDetailPage = () => {
  const { delegateId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(params.get('edit') === '1');
  const [showFinished, setShowFinished] = useState(false);

  const detail = useAsync<DelegateDetail>(
    (signal) => api.get<DelegateDetail>(`/delegates/${delegateId}`, undefined, signal),
    [delegateId],
  );
  const trips = useAsync<DelegateTripRow[]>(
    (signal) =>
      api.get<DelegateTripRow[]>(
        `/delegates/${delegateId}/trips`,
        { scope: showFinished ? 'all' : 'active' },
        signal,
      ),
    [delegateId, showFinished],
  );

  const closeEdit = () => {
    setEditing(false);
    params.delete('edit');
    setParams(params, { replace: true });
    detail.reload();
  };

  const setStatus = async () => {
    const delegate = detail.data;
    if (!delegate) return;
    const next = delegate.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.post(`/delegates/${delegateId}/status`, { status: next });
      toast.success('تم تحديث حالة المندوب');
      detail.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (detail.loading)
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  if (detail.error || !detail.data)
    return (
      <div className="page">
        <EmptyState title="تعذر تحميل بيانات المندوب" />
      </div>
    );

  const delegate = detail.data;
  const workspace = (tripId: string) => `/delegates/${delegateId}/trips/${tripId}/pilgrims`;

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: 'المناديب', to: '/delegates' }, { label: delegate.name }]} />
      <PageHeader
        title={delegate.name}
        subtitle={`${delegate.phone} — ${delegate.address}`}
        actions={
          <>
            {!delegate.isSystem ? (
              <>
                <button type="button" className="btn" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={15} /> تعديل
                </button>
                <button type="button" className="btn secondary" onClick={() => void setStatus()}>
                  {delegate.status === 'ACTIVE' ? 'إيقاف المندوب' : 'تفعيل المندوب'}
                </button>
              </>
            ) : null}
            <Link className="btn ghost" to={`/accounts/${delegateId}`}>
              <Icon name="wallet" size={15} /> حساب المندوب
            </Link>
          </>
        }
      />

      {/* Stacked (not side by side) so the trips table has the full width. */}
      <div className="stack">
        <div className="card">
          <div className="card-header">
            <h3>بيانات المندوب</h3>
            <Badge tone={delegate.status === 'ACTIVE' ? 'success' : 'warning'}>
              {delegateStatusLabel[delegate.status]}
            </Badge>
          </div>
          <div className="card-body">
            <dl className="kv">
              <dt>الاسم</dt>
              <dd>{delegate.name}</dd>
              <dt>الهاتف</dt>
              <dd className="mono">{delegate.phone}</dd>
              <dt>العنوان</dt>
              <dd>{delegate.address}</dd>
              <dt>الرحلات النشطة</dt>
              <dd className="mono">{delegate.activeTripCount}</dd>
              <dt>إجمالي الرحلات</dt>
              <dd className="mono">{delegate.tripCount}</dd>
              <dt>المعتمرون الحاليون</dt>
              <dd className="mono">{delegate.activePilgrimCount}</dd>
              <dt>ملاحظات</dt>
              <dd>{delegate.notes || '—'}</dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>{showFinished ? 'كل رحلات المندوب' : 'الرحلات النشطة والقادمة'}</h3>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setShowFinished((value) => !value)}
            >
              {showFinished ? 'النشطة فقط' : 'عرض الرحلات المنتهية أيضاً'}
            </button>
          </div>
          <div className="card-body flush">
            {trips.loading ? <LoadingBlock /> : null}
            {trips.error ? <EmptyState title="تعذر تحميل رحلات المندوب" /> : null}
            {trips.data && trips.data.length === 0 ? (
              <EmptyState
                title={showFinished ? 'لا توجد رحلات' : 'لا توجد رحلات نشطة'}
                description="يتم إسناد المندوب إلى رحلة من صفحة الرحلة"
              />
            ) : null}
            {trips.data && trips.data.length > 0 ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>الرحلة</th>
                      <th>تاريخ السفر</th>
                      <th>تاريخ العودة</th>
                      <th>الطيران</th>
                      <th className="num">معتمرو المندوب</th>
                      <th>الحالة</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.data.map((trip) => (
                      <tr key={trip.tripId}>
                        <td>
                          <Link to={workspace(trip.tripId)}>
                            <strong>{trip.name}</strong>
                          </Link>
                        </td>
                        <td className="mono">{formatDate(trip.departureDate)}</td>
                        <td className="mono">{formatDate(trip.returnDate)}</td>
                        <td>{flightTypeLabel[trip.flightType]}</td>
                        <td className="num mono">
                          <strong>{trip.activePilgrimCount}</strong> معتمر
                        </td>
                        <td>
                          <Badge tone={trip.isActive ? 'success' : 'default'}>
                            {trip.isActive ? tripStatusLabel[trip.status] : 'منتهية'}
                          </Badge>
                        </td>
                        <td>
                          <Link className="btn ghost sm" to={workspace(trip.tripId)}>
                            <Icon name="pilgrim" size={14} /> المعتمرون
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {editing ? (
        <DelegateFormModal delegate={delegate} onClose={closeEdit} onSaved={closeEdit} />
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" className="btn secondary" onClick={() => navigate('/delegates')}>
          <Icon name="arrow-right" size={15} /> رجوع للمناديب
        </button>
        <span className="muted small">
          مسجل منذ <span className="mono">{formatDate(delegate.createdAt)}</span>
        </span>
      </div>
    </div>
  );
};
