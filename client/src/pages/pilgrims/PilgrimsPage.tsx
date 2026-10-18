import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { PilgrimFilterOptions, PilgrimList, PilgrimStatus } from '../../api/types';
import { useAsync } from '../../lib/hooks';
import { documentStatusLabel, formatCount, formatDate } from '../../lib/format';
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  LoadingBlock,
  PageHeader,
  Pagination,
  SelectInput,
  Tabs,
  TextInput,
  useDebouncedValue,
} from '../../ui/primitives';
import type { PilgrimListOrigin } from './PilgrimDetailPage';

const PAGE_SIZE = 20;
const FILTER_KEYS = ['q', 'tripId', 'delegateId', 'documentStatus'] as const;

/**
 * Global pilgrim search. Every filter, the status tab and the page live in the
 * URL, so «رجوع» from a pilgrim file returns to the same view. Active pilgrims
 * by default; no financial data.
 */
export const PilgrimsPage = () => {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as PilgrimStatus | null) ?? 'ACTIVE';
  const tripId = params.get('tripId') ?? '';
  const delegateId = params.get('delegateId') ?? '';
  const documentStatus = params.get('documentStatus') ?? 'ALL';
  const page = Number(params.get('page') ?? '1') || 1;
  const q = params.get('q') ?? '';

  const update = (changes: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value && !(key === 'status' && value === 'ACTIVE') && !(key === 'documentStatus' && value === 'ALL')) {
        next.set(key, value);
      } else next.delete(key);
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  };

  // Typing is local; the URL (and the request) follow the debounced value.
  const [search, setSearch] = useState(q);
  const debounced = useDebouncedValue(search.trim());
  useEffect(() => {
    if (debounced !== q) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const options = useAsync<PilgrimFilterOptions>(
    (signal) => api.get<PilgrimFilterOptions>('/pilgrims/filter-options', undefined, signal),
    [],
  );

  const { data, loading, error, reload } = useAsync<PilgrimList>(
    (signal) =>
      api.get<PilgrimList>(
        '/pilgrims',
        {
          page,
          pageSize: PAGE_SIZE,
          status,
          search: q || undefined,
          tripId: tripId || undefined,
          delegateId: delegateId || undefined,
          documentStatus,
        },
        signal,
      ),
    [page, status, q, tripId, delegateId, documentStatus],
  );

  const filtered = FILTER_KEYS.some((key) => params.get(key));
  const origin: PilgrimListOrigin = { from: `${location.pathname}${location.search}` };

  return (
    <div className="page">
      <PageHeader
        title="المعتمرون"
        subtitle="بحث عن أي معتمر في كل الرحلات والمناديب"
        actions={
          <Link className="btn" to="/pilgrims/new">
            <Icon name="plus" size={15} /> إضافة معتمر
          </Link>
        }
      />

      <div className="card" style={{ marginBottom: 16 }}>
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
            <Field label="الرحلة">
              <SelectInput value={tripId} onChange={(event) => update({ tripId: event.target.value })}>
                <option value="">كل الرحلات</option>
                {(options.data?.trips ?? []).map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.name} — {formatDate(trip.departureDate)}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="المندوب">
              <SelectInput value={delegateId} onChange={(event) => update({ delegateId: event.target.value })}>
                <option value="">كل المناديب</option>
                {(options.data?.delegates ?? []).map((delegate) => (
                  <option key={delegate.id} value={delegate.id}>
                    {delegate.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="حالة المستندات">
              <SelectInput
                value={documentStatus}
                onChange={(event) => update({ documentStatus: event.target.value })}
              >
                <option value="ALL">الكل</option>
                <option value="COMPLETE">مكتمل</option>
                <option value="INCOMPLETE">ناقص</option>
              </SelectInput>
            </Field>
            {filtered ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setSearch('');
                  update({ q: '', tripId: '', delegateId: '', documentStatus: '' });
                }}
              >
                مسح التصفية
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="filter-tabs">
        <Tabs
          items={[
            { id: 'ACTIVE', label: 'النشطون', count: data?.counts.ACTIVE },
            { id: 'CANCELLED', label: 'المستبعدون', count: data?.counts.CANCELLED },
          ]}
          active={status}
          onChange={(id) => update({ status: id })}
        />
      </div>

      <div className="card">
        {loading && !data ? <LoadingBlock /> : null}
        {error ? (
          <EmptyState
            icon="alert"
            title="تعذر تحميل قائمة المعتمرين"
            action={
              <button type="button" className="btn secondary" onClick={reload}>
                إعادة المحاولة
              </button>
            }
          />
        ) : null}
        {data && !error ? (
          data.items.length === 0 ? (
            <EmptyState
              icon="pilgrim"
              title={
                filtered
                  ? 'لا توجد نتائج مطابقة'
                  : status === 'CANCELLED'
                    ? 'لا يوجد معتمرون مستبعدون'
                    : 'لا يوجد معتمرون بعد'
              }
              description={filtered ? 'جرّب تغيير البحث أو التصفية' : undefined}
              action={
                !filtered && status === 'ACTIVE' ? (
                  <Link className="btn" to="/pilgrims/new">
                    إضافة معتمر
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className={`table-wrap${loading ? ' is-refreshing' : ''}`}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>اسم المعتمر</th>
                      <th>رقم جواز السفر</th>
                      <th>الرقم القومي</th>
                      <th>المندوب</th>
                      <th>الرحلة</th>
                      <th>حالة المستندات</th>
                      <th>الحالة</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((pilgrim) => {
                      const cancelled = pilgrim.status === 'CANCELLED';
                      const canEdit = !cancelled && pilgrim.tripCapabilities.canEditPilgrims;
                      return (
                        <tr key={pilgrim.id} className={cancelled ? 'row-voided' : undefined}>
                          <td>
                            <Link to={`/pilgrims/${pilgrim.id}`} state={origin}>
                              <strong>{pilgrim.name}</strong>
                            </Link>
                          </td>
                          <td className="mono">{pilgrim.passportNumber}</td>
                          <td className="mono">{pilgrim.nationalId || '—'}</td>
                          <td>{pilgrim.delegate.name}</td>
                          <td>
                            {pilgrim.trip?.name ?? '—'}
                            {pilgrim.trip?.departureDate ? (
                              <div className="muted small mono">{formatDate(pilgrim.trip.departureDate)}</div>
                            ) : null}
                          </td>
                          <td>
                            <Badge tone={pilgrim.documentStatus === 'COMPLETE' ? 'success' : 'warning'}>
                              {documentStatusLabel[pilgrim.documentStatus]}
                            </Badge>
                          </td>
                          <td>
                            {cancelled ? (
                              <>
                                <Badge tone="danger">مستبعد</Badge>
                                {pilgrim.cancelledAt ? (
                                  <div className="muted small mono">{formatDate(pilgrim.cancelledAt)}</div>
                                ) : null}
                              </>
                            ) : (
                              <Badge tone="success">نشط</Badge>
                            )}
                          </td>
                          <td>
                            <div className="row nowrap">
                              <Link className="btn ghost sm" to={`/pilgrims/${pilgrim.id}`} state={origin}>
                                <Icon name="eye" size={14} /> الملف
                              </Link>
                              {canEdit ? (
                                <Link className="btn ghost sm" to={`/pilgrims/${pilgrim.id}/edit`} state={origin}>
                                  <Icon name="edit" size={14} /> تعديل
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination {...data.meta} onPage={(next) => update({ page: String(next) }, true)} />
            </>
          )
        ) : null}
      </div>
      {data ? (
        <p className="muted small" style={{ marginTop: 10 }}>
          {formatCount(data.meta.total)} معتمر {status === 'CANCELLED' ? 'مستبعد' : 'نشط'}
          {filtered ? ' مطابق للتصفية' : ''}
        </p>
      ) : null}
    </div>
  );
};
