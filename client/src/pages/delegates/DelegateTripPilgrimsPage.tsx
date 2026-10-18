import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { DelegateTripPilgrim, DelegateTripPilgrims, PilgrimStatus } from '../../api/types';
import { CARDS_QUERY, useAsync, useMediaQuery } from '../../lib/hooks';
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
  PageHeader,
  SelectInput,
  Tabs,
  TextInput,
} from '../../ui/primitives';
import { CancelPilgrimModal, TransferModal } from '../../components/PilgrimModals';
import { PassengerListExport } from '../../components/PassengerListExport';

/**
 * Main operational workspace: the pilgrims of ONE delegate in ONE trip.
 * The list is filtered on the server (/delegates/:id/trips/:tripId/pilgrims);
 * new pilgrims created here are bound to this delegate and trip.
 */
export const DelegateTripPilgrimsPage = () => {
  const { delegateId = '', tripId = '' } = useParams();
  const navigate = useNavigate();
  // Tablets and phones: cards (every action reachable without sideways scrolling).
  const cards = useMediaQuery(CARDS_QUERY);
  const [view, setView] = useState<PilgrimStatus>('ACTIVE');
  const [search, setSearch] = useState('');
  const [docFilter, setDocFilter] = useState<'ALL' | 'INCOMPLETE'>('ALL');
  const [transferring, setTransferring] = useState<DelegateTripPilgrim | null>(null);
  const [cancelling, setCancelling] = useState<DelegateTripPilgrim | null>(null);
  const [exporting, setExporting] = useState(false);

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

  /** Actions shared by the table (icons + tooltips) and the cards (labelled). */
  const renderActions = (pilgrim: DelegateTripPilgrim, labelled: boolean) => {
    const cls = labelled ? 'btn secondary sm' : 'btn ghost sm icon-only';
    const label = (text: string) => (labelled ? ` ${text}` : null);
    if (pilgrim.status === 'CANCELLED') {
      return (
        <Link className={labelled ? cls : 'btn ghost sm'} to={`${base}/${pilgrim.id}`}>
          <Icon name="eye" size={14} /> عرض
        </Link>
      );
    }
    return (
      <div className={labelled ? 'row' : 'row nowrap row-actions'}>
        <Link className={cls} to={`${base}/${pilgrim.id}`} title="ملف المعتمر" aria-label="ملف المعتمر">
          <Icon name="eye" size={15} />
          {label('الملف')}
        </Link>
        {canEdit ? (
          <Link className={cls} to={`${base}/${pilgrim.id}/edit`} title="تعديل البيانات" aria-label="تعديل البيانات">
            <Icon name="edit" size={15} />
            {label('تعديل')}
          </Link>
        ) : null}
        <button type="button" className={cls} title="المستندات" aria-label="المستندات" onClick={() => navigate(`${base}/${pilgrim.id}#documents`)}>
          <Icon name="file" size={15} />
          {label('المستندات')}
        </button>
        {canTransfer ? (
          <button type="button" className={cls} title="نقل إلى رحلة أخرى" aria-label="نقل إلى رحلة أخرى" onClick={() => setTransferring(pilgrim)}>
            <Icon name="refresh" size={15} />
            {label('نقل')}
          </button>
        ) : null}
        {canCancel ? (
          <button type="button" className={`${cls} danger-text`} title="استبعاد" aria-label="استبعاد" onClick={() => setCancelling(pilgrim)}>
            <Icon name="trash" size={15} />
            {label('استبعاد')}
          </button>
        ) : null}
      </div>
    );
  };
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
            <button type="button" className="btn secondary" onClick={() => setExporting(true)}>
              <Icon name="download" size={15} /> طباعة كشف المعتمرين
            </button>
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
        ) : !loading && cards ? (
          <ul className="pilgrim-cards">
            {rows.map((pilgrim, index) => (
              <li key={pilgrim.id} className={`pilgrim-card${pilgrim.status === 'CANCELLED' ? ' is-cancelled' : ''}`}>
                <div className="pilgrim-card-head">
                  <Link to={`${base}/${pilgrim.id}`}>
                    <span className="muted mono">{index + 1}.</span> <strong>{pilgrim.name}</strong>
                  </Link>
                  {pilgrim.status === 'CANCELLED' ? <Badge tone="danger">مستبعد</Badge> : <Badge tone="success">نشط</Badge>}
                </div>
                <dl className="pilgrim-card-meta">
                  <dt>رقم الجواز</dt>
                  <dd className="mono">{pilgrim.passportNumber}</dd>
                  <dt>الرقم القومي</dt>
                  <dd className="mono">{pilgrim.nationalId ?? '—'}</dd>
                  {pilgrim.status === 'CANCELLED' ? (
                    <>
                      <dt>تاريخ الاستبعاد</dt>
                      <dd className="mono">{pilgrim.cancelledAt ? formatDateTime(pilgrim.cancelledAt) : '—'}</dd>
                      <dt>السبب</dt>
                      <dd>{pilgrim.cancelReason ?? '—'}</dd>
                    </>
                  ) : null}
                </dl>
                <div className="pilgrim-card-foot">
                  {pilgrim.status === 'CANCELLED' ? (
                    <span />
                  ) : (
                    <Badge tone={pilgrim.documentStatus === 'COMPLETE' ? 'success' : 'warning'}>
                      {documentStatusLabel[pilgrim.documentStatus]}
                    </Badge>
                  )}
                  {renderActions(pilgrim, true)}
                </div>
              </li>
            ))}
          </ul>
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
                    <td>{renderActions(pilgrim, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading ? (
          <div className="table-wrap">
            <table className="data dense">
              <thead>
                <tr>
                  <th className="num">م</th>
                  <th>الاسم</th>
                  <th>رقم الجواز</th>
                  <th>الرقم القومي</th>
                  <th>تاريخ الميلاد</th>
                  <th>المهنة</th>
                  <th>حالة المستندات</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((pilgrim, index) => (
                  <tr key={pilgrim.id}>
                    <td className="num mono">{index + 1}</td>
                    <td className="name-cell">
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
                      {renderActions(pilgrim, false)}
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
            trip: { id: trip.id, name: trip.name, departureDate: trip.departureDate },
            delegate: { id: delegate.id },
          }}
          onClose={() => setTransferring(null)}
          onDone={reload}
        />
      ) : null}

      {exporting ? (
        <PassengerListExport
          title="كشف معتمري المندوب"
          description={`المعتمرون النشطون للمندوب ${delegate.name} في ${trip.name} (${summary.total} معتمر) — المستبعدون لا يظهرون في الكشف.`}
          endpoint="/reports/delegate-trip-pilgrims"
          query={{ delegateId: delegate.id, tripId: trip.id }}
          onClose={() => setExporting(false)}
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
