import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, download } from '../../api/client';
import type { Delegate, Paginated, PaymentRow, PaymentStatus } from '../../api/types';
import { useAsync, useListState } from '../../lib/hooks';
import {
  formatDate,
  formatAmount,
  formatDateTime,
  paymentMethodLabel,
  paymentStatusLabel,
  receiptNumberOf,
  transferTypeLabel,
} from '../../lib/format';
import { ReceiptScanLink } from '../../components/DelegateAccount';
import { VoidPaymentModal } from '../../components/VoidPaymentModal';
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
import { useAuth } from '../../auth/AuthContext';

type PaymentItem = PaymentRow;

export const PaymentsPage = () => {
  const list = useListState();
  const { isManager } = useAuth();
  const [params, setParams] = useSearchParams();
  const delegateId = params.get('delegateId') ?? '';
  const [status, setStatus] = useState<'' | PaymentStatus>('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [voiding, setVoiding] = useState<PaymentItem | null>(null);
  const debouncedStatus = useDebouncedValue(status);

  const setDelegate = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('delegateId', value);
    else next.delete('delegateId');
    setParams(next, { replace: true });
  };

  const delegates = useAsync<Paginated<Delegate>>(
    (signal) => api.get<Paginated<Delegate>>('/delegates', { pageSize: 200 }, signal),
    [],
  );

  const { data, loading, error, reload } = useAsync<Paginated<PaymentItem>>(
    (signal) =>
      api.get<Paginated<PaymentItem>>(
        '/payments',
        {
          page: list.page,
          pageSize: list.pageSize,
          delegateId: delegateId || undefined,
          status: debouncedStatus || undefined,
          search: debouncedSearch.trim() || undefined,
          from: from || undefined,
          to: to || undefined,
        },
        signal,
      ),
    [list.page, list.pageSize, delegateId, debouncedStatus, debouncedSearch, from, to],
  );

  return (
    <div className="page">
      <PageHeader
        title="سجل الدفعات"
        subtitle="الدفعات المستلمة من المندوبين مع أرقام الإيصالات الورقية وصورها"
        actions={
          <>
            <button
              type="button"
              className="btn secondary"
              onClick={() => download('/reports/payments/excel', { delegateId: delegateId || undefined })}
            >
              <Icon name="download" size={15} /> Excel
            </button>
            <Link className="btn" to="/payments/new">
              <Icon name="plus" size={15} /> تسجيل دفعة
            </Link>
          </>
        }
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="filters">
            <Field label="المندوب">
              <SelectInput value={delegateId} onChange={(event) => setDelegate(event.target.value)}>
                <option value="">كل المندوبين</option>
                {(delegates.data?.items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="رقم الإيصال / المندوب">
              <TextInput value={search} onChange={(event) => setSearch(event.target.value)} />
            </Field>
            <Field label="الحالة">
              <SelectInput
                value={status}
                onChange={(event) => setStatus(event.target.value as PaymentStatus | '')}
              >
                <option value="">الكل</option>
                <option value="ACTIVE">مسجلة</option>
                <option value="VOIDED">ملغاة</option>
              </SelectInput>
            </Field>
            <Field label="من تاريخ">
              <TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} dir="ltr" />
            </Field>
            <Field label="إلى تاريخ">
              <TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} dir="ltr" />
            </Field>
            <button type="button" className="btn secondary" onClick={reload}>
              <Icon name="refresh" size={15} /> تحديث
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <LoadingBlock /> : null}
        {error ? <EmptyState title="تعذر تحميل الدفعات" /> : null}
        {data ? (
          data.items.length === 0 ? (
            <EmptyState
              title="لا توجد دفعات"
              action={
                <Link className="btn" to="/payments/new">
                  تسجيل دفعة
                </Link>
              }
            />
          ) : (
            <>
              <div className="table-wrap">
                <table className="data stack-on-phone">
                  <thead>
                    <tr>
                      <th>رقم الإيصال الورقي</th>
                      <th>تاريخ الدفع</th>
                      <th>المندوب</th>
                      <th className="num">المبلغ</th>
                      <th>طريقة الدفع</th>
                      <th>المرجع</th>
                      <th>سجّلها</th>
                      <th>حالة الحركة</th>
                      <th>صورة الإيصال</th>
                      {isManager ? <th></th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((payment) => (
                      <tr key={payment.id}>
                        <td className="mono">
                          <strong>{receiptNumberOf(payment)}</strong>
                        </td>
                        <td className="mono">{formatDate(payment.paymentDate)}</td>
                        <td>
                          {payment.delegate ? (
                            <Link to={`/accounts/${payment.delegate.id}`}>{payment.delegate.name}</Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="num mono">
                          <strong>{formatAmount(payment.amount)}</strong>
                        </td>
                        <td>{paymentMethodLabel[payment.paymentMethod]}</td>
                        <td className="mono">
                          {payment.paymentMethod === 'TRANSFER' && payment.transferType
                            ? transferTypeLabel[payment.transferType]
                            : '—'}
                          {payment.referenceNumber ? ` — ${payment.referenceNumber}` : ''}
                        </td>
                        <td>{payment.createdBy?.fullName ?? '—'}</td>
                        <td>
                          <Badge tone={payment.status === 'ACTIVE' ? 'success' : 'danger'}>
                            {paymentStatusLabel[payment.status]}
                          </Badge>
                          {isManager && payment.status === 'VOIDED' ? (
                            <div className="muted small">
                              {payment.voidReason}
                              {payment.voidedBy ? ` — ${payment.voidedBy.fullName}` : ''}
                              {payment.voidedAt ? ` — ${formatDateTime(payment.voidedAt)}` : ''}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <ReceiptScanLink payment={payment} />
                        </td>
                        {isManager ? (
                          <td>
                            {payment.status === 'ACTIVE' ? (
                              <button
                                type="button"
                                className="btn ghost sm"
                                onClick={() => setVoiding(payment)}
                              >
                                إلغاء الدفعة
                              </button>
                            ) : null}
                          </td>
                        ) : null}
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

      {voiding ? (
        <VoidPaymentModal payment={voiding} onClose={() => setVoiding(null)} onDone={reload} />
      ) : null}
    </div>
  );
};
