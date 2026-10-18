import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Delegate, Paginated, Pilgrim, Trip } from '../../api/types';
import { useAsync, useListState } from '../../lib/hooks';
import { documentStatusLabel, formatDate } from '../../lib/format';
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  LoadingBlock,
  PageHeader,
  Pagination,
  SelectInput,
  TextInput,
} from '../../ui/primitives';

export const PilgrimsPage = () => {
  const list = useListState();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const tripId = params.get('tripId') ?? '';
  const delegateId = params.get('delegateId') ?? '';
  const documentStatus = params.get('documentStatus') ?? 'ALL';

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const trips = useAsync<Paginated<Trip>>(
    (signal) => api.get<Paginated<Trip>>('/trips', { pageSize: 200 }, signal),
    [],
  );
  const delegates = useAsync<Paginated<Delegate>>(
    (signal) => api.get<Paginated<Delegate>>('/delegates', { pageSize: 200 }, signal),
    [],
  );

  const { data, loading, error, reload } = useAsync<Paginated<Pilgrim>>(
    (signal) =>
      api.get<Paginated<Pilgrim>>(
        '/pilgrims',
        {
          page: list.page,
          pageSize: list.pageSize,
          search: list.debouncedSearch || undefined,
          tripId: tripId || undefined,
          delegateId: delegateId || undefined,
          documentStatus,
        },
        signal,
      ),
    [list.page, list.pageSize, list.debouncedSearch, tripId, delegateId, documentStatus],
  );

  return (
    <div className="page">
      <PageHeader
        title="المعتمرون"
        subtitle="إدارة ملفات المعتمرين ووثائقهم"
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
                value={list.search}
                onChange={(event) => list.setSearch(event.target.value)}
                placeholder="الاسم أو رقم الجواز أو الهوية"
              />
            </Field>
            <Field label="الرحلة">
              <SelectInput value={tripId} onChange={(event) => setFilter('tripId', event.target.value)}>
                <option value="">كل الرحلات</option>
                {(trips.data?.items ?? []).map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="المندوب">
              <SelectInput
                value={delegateId}
                onChange={(event) => setFilter('delegateId', event.target.value)}
              >
                <option value="">كل المندوبين</option>
                {(delegates.data?.items ?? []).map((delegate) => (
                  <option key={delegate.id} value={delegate.id}>
                    {delegate.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="حالة الوثائق">
              <SelectInput
                value={documentStatus}
                onChange={(event) => setFilter('documentStatus', event.target.value)}
              >
                <option value="ALL">الكل</option>
                <option value="COMPLETE">مكتملة</option>
                <option value="INCOMPLETE">ناقصة</option>
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
        {error ? <EmptyState title="تعذر تحميل قائمة المعتمرين" /> : null}
        {data ? (
          data.items.length === 0 ? (
            <EmptyState
              title="لا يوجد معتمرون"
              description="أضف معتمراً جديداً أو عدّل عوامل التصفية"
              action={
                <Link className="btn" to="/pilgrims/new">
                  إضافة معتمر
                </Link>
              }
            />
          ) : (
            <>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>الاسم</th>
                      <th>جواز السفر</th>
                      <th>الهوية</th>
                      <th>الرحلة</th>
                      <th>المندوب</th>
                      <th>الوثائق</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((pilgrim) => (
                      <tr key={pilgrim.id}>
                        <td>
                          <Link to={`/pilgrims/${pilgrim.id}`}>
                            <strong>{pilgrim.name}</strong>
                          </Link>
                        </td>
                        <td className="mono">{pilgrim.passportNumber}</td>
                        <td className="mono">{pilgrim.nationalId ?? '—'}</td>
                        <td>{pilgrim.trip?.name ?? '—'}</td>
                        <td>{pilgrim.delegate.name}</td>
                        <td>
                          <Badge tone={pilgrim.documentStatus === 'COMPLETE' ? 'success' : 'warning'}>
                            {documentStatusLabel[pilgrim.documentStatus]}
                          </Badge>
                        </td>
                        <td>
                          <div className="row">
                            <button
                              type="button"
                              className="btn ghost sm"
                              onClick={() => navigate(`/pilgrims/${pilgrim.id}`)}
                            >
                              <Icon name="eye" size={14} /> الملف
                            </button>
                            <Link className="btn ghost sm" to={`/pilgrims/${pilgrim.id}/edit`}>
                              <Icon name="edit" size={14} /> تعديل
                            </Link>
                          </div>
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

      {data && data.items.length > 0 ? (
        <p className="muted small" style={{ marginTop: 10 }}>
          آخر تسجيل: {formatDate(data.items[0].createdAt)}
        </p>
      ) : null}
    </div>
  );
};
