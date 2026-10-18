import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Delegate, FinancialMovement, MovementKind, Paginated } from '../../api/types';
import { useAsync, useListState } from '../../lib/hooks';
import { formatAmount, formatDate, movementKindLabel } from '../../lib/format';
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
  useDebouncedValue,
} from '../../ui/primitives';

/**
 * سجل الحركات المالية (manager only): payments, voids, refunds and
 * corrections in date order, read from the records that define the account.
 */
export const MovementsPage = () => {
  const list = useListState();
  const [params] = useSearchParams();
  // Opened from a delegate account with ?delegateId=… preselected.
  const [delegateId, setDelegateId] = useState(params.get('delegateId') ?? '');
  const [kind, setKind] = useState<'' | MovementKind>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const debouncedFrom = useDebouncedValue(from);
  const debouncedTo = useDebouncedValue(to);

  const delegates = useAsync<Paginated<Delegate>>(
    (signal) => api.get<Paginated<Delegate>>('/delegates', { pageSize: 200 }, signal),
    [],
  );

  const { data, loading, error, reload } = useAsync<Paginated<FinancialMovement>>(
    (signal) =>
      api.get<Paginated<FinancialMovement>>(
        '/finance/movements',
        {
          page: list.page,
          pageSize: list.pageSize,
          delegateId: delegateId || undefined,
          kind: kind || undefined,
          from: debouncedFrom || undefined,
          to: debouncedTo || undefined,
        },
        signal,
      ),
    [list.page, list.pageSize, delegateId, kind, debouncedFrom, debouncedTo],
  );

  return (
    <div className="page">
      <PageHeader
        title="سجل الحركات المالية"
        subtitle="الدفعات والإلغاءات والاستردادات والتسويات لكل المناديب — للمدير فقط"
        actions={
          <button type="button" className="btn secondary" onClick={reload}>
            <Icon name="refresh" size={15} /> تحديث
          </button>
        }
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="filters">
            <Field label="المندوب">
              <SelectInput value={delegateId} onChange={(event) => setDelegateId(event.target.value)}>
                <option value="">كل المناديب</option>
                {(delegates.data?.items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="نوع الحركة">
              <SelectInput value={kind} onChange={(event) => setKind(event.target.value as MovementKind | '')}>
                <option value="">الكل</option>
                {(Object.keys(movementKindLabel) as MovementKind[]).map((value) => (
                  <option key={value} value={value}>
                    {movementKindLabel[value]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="من تاريخ">
              <TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} dir="ltr" />
            </Field>
            <Field label="إلى تاريخ">
              <TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} dir="ltr" />
            </Field>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <LoadingBlock /> : null}
        {error ? <EmptyState title="تعذر تحميل سجل الحركات" /> : null}
        {data ? (
          data.items.length === 0 ? (
            <EmptyState title="لا توجد حركات" />
          ) : (
            <>
              <div className="table-wrap">
                <table className="data stack-on-phone">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>المندوب</th>
                      <th>نوع الحركة</th>
                      <th>رقم الإيصال</th>
                      <th className="wrap">السبب</th>
                      <th>الأثر على الحساب</th>
                      <th className="num">المبلغ</th>
                      <th>بواسطة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row) => (
                      <tr key={row.id}>
                        <td className="mono">{formatDate(row.date)}</td>
                        <td>
                          <Link to={`/accounts/${row.delegate.id}`}>{row.delegate.name}</Link>
                        </td>
                        <td>{movementKindLabel[row.kind]}</td>
                        <td className="mono">{row.receiptNumber ?? '—'}</td>
                        <td className="wrap">{row.reason ?? '—'}</td>
                        <td>
                          <Badge tone={row.effect === 'INCREASE' ? 'warning' : 'success'}>
                            {row.effect === 'INCREASE' ? 'يزيد المتبقي عليه' : 'يقلل المتبقي عليه'}
                          </Badge>
                        </td>
                        <td className="num mono">
                          <strong>{formatAmount(row.amount)}</strong>
                        </td>
                        <td>{row.performedBy?.fullName ?? '—'}</td>
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
    </div>
  );
};
