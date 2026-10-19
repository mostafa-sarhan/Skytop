import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, download } from '../../api/client';
import type { ExpenseCategory, ExpenseList, ExpenseSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useAsync } from '../../lib/hooks';
import {
  expenseCategoryLabel,
  expenseStatusLabel,
  formatAmount,
  formatCount,
  formatDate,
  paymentMethodLabel,
  transferTypeLabel,
} from '../../lib/format';
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  LoadingBlock,
  PageHeader,
  Pagination,
  SelectInput,
  StatCard,
  TextInput,
  useDebouncedValue,
} from '../../ui/primitives';
import { useRowLink } from '../../lib/rowLink';

const PAGE_SIZE = 20;
const CATEGORIES = Object.keys(expenseCategoryLabel) as ExpenseCategory[];
const FILTER_KEYS = ['q', 'category', 'paymentMethod', 'status', 'from', 'to'] as const;

const money = (value: string) => `${formatAmount(value)} جنيه`;

/**
 * المصروفات — the company's own operating costs (separate from delegate
 * accounts). Filters, page and totals all come from the server.
 */
export const ExpensesPage = () => {
  const { isManager } = useAuth();
  const rowLink = useRowLink();
  const [params, setParams] = useSearchParams();
  const get = (key: string) => params.get(key) ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const [includeVoided, setIncludeVoided] = useState(false);

  const update = (changes: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  };

  const [search, setSearch] = useState(get('q'));
  const debounced = useDebouncedValue(search.trim());
  useEffect(() => {
    if (debounced !== get('q')) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const filters = {
    search: get('q') || undefined,
    category: get('category') || undefined,
    paymentMethod: get('paymentMethod') || undefined,
    from: get('from') || undefined,
    to: get('to') || undefined,
  };

  const summary = useAsync<ExpenseSummary>((signal) => api.get<ExpenseSummary>('/expenses/summary', undefined, signal), []);
  const list = useAsync<ExpenseList>(
    (signal) =>
      api.get<ExpenseList>(
        '/expenses',
        { ...filters, status: get('status') || undefined, page, pageSize: PAGE_SIZE },
        signal,
      ),
    [params.toString()],
  );

  const filtered = FILTER_KEYS.some((key) => params.get(key));
  const exportQuery = { ...filters, includeVoided: includeVoided ? '1' : undefined };

  return (
    <div className="page">
      <PageHeader
        title="المصروفات"
        subtitle="مصروفات الشركة التشغيلية (كهرباء، إنترنت، إيجار...) — منفصلة تماماً عن حسابات المناديب"
        actions={
          <Link className="btn" to="/expenses/new">
            <Icon name="plus" size={15} /> إضافة مصروف
          </Link>
        }
      />

      <div className="grid cols-3 mb-5">
        <StatCard
          label="إجمالي المصروفات"
          value={summary.data ? money(summary.data.totalActive) : '—'}
          hint="كل المصروفات المسجلة (بدون الملغاة)"
          icon="wallet"
        />
        <StatCard
          label="مصروفات هذا الشهر"
          value={summary.data ? money(summary.data.monthTotal) : '—'}
          hint={summary.data ? `${formatCount(summary.data.monthCount)} مصروف هذا الشهر` : ''}
          icon="clock"
          tone="info"
        />
        <StatCard
          label="عدد المصروفات"
          value={summary.data ? formatCount(summary.data.activeCount) : '—'}
          hint="بدون الملغاة"
          icon="receipt"
        />
      </div>

      {isManager && summary.data?.monthByCategory && summary.data.monthByCategory.length > 0 ? (
        <div className="card mb-5">
          <div className="card-header">
            <h3>مصروفات هذا الشهر حسب التصنيف</h3>
          </div>
          <div className="card-body">
            <div className="row">
              {summary.data.monthByCategory.map((row) => (
                <Badge key={row.category} tone="primary" dot={false}>
                  {expenseCategoryLabel[row.category]}: {money(row.total)}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body stack">
          <div className="filters">
            <Field label="بحث">
              <TextInput
                className="input-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="البيان أو الرقم المرجعي"
                latinDigits
              />
            </Field>
            <Field label="التصنيف">
              <SelectInput value={get('category')} onChange={(event) => update({ category: event.target.value })}>
                <option value="">كل التصنيفات</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {expenseCategoryLabel[c]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="طريقة الدفع">
              <SelectInput value={get('paymentMethod')} onChange={(event) => update({ paymentMethod: event.target.value })}>
                <option value="">الكل</option>
                <option value="CASH">{paymentMethodLabel.CASH}</option>
                <option value="TRANSFER">{paymentMethodLabel.TRANSFER}</option>
              </SelectInput>
            </Field>
            <Field label="الحالة">
              <SelectInput value={get('status')} onChange={(event) => update({ status: event.target.value })}>
                <option value="">الكل</option>
                <option value="ACTIVE">{expenseStatusLabel.ACTIVE}</option>
                <option value="VOIDED">{expenseStatusLabel.VOIDED}</option>
              </SelectInput>
            </Field>
            <Field label="من تاريخ">
              <TextInput type="date" dir="ltr" value={get('from')} onChange={(event) => update({ from: event.target.value })} />
            </Field>
            <Field label="إلى تاريخ">
              <TextInput type="date" dir="ltr" value={get('to')} onChange={(event) => update({ to: event.target.value })} />
            </Field>
            {filtered ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setSearch('');
                  update(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])));
                }}
              >
                مسح التصفية
              </button>
            ) : null}
          </div>
          <div className="row between">
            <label className="checkbox small">
              <input type="checkbox" checked={includeVoided} onChange={(event) => setIncludeVoided(event.target.checked)} />
              إظهار الملغاة في التصدير (معلَّمة ولا تدخل في الإجمالي)
            </label>
            <div className="row">
              <button type="button" className="btn secondary sm" onClick={() => download('/reports/expenses/excel', exportQuery)}>
                <Icon name="download" size={14} /> Excel
              </button>
              <button type="button" className="btn secondary sm" onClick={() => download('/reports/expenses/pdf', exportQuery)}>
                <Icon name="download" size={14} /> PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        {list.loading && !list.data ? <LoadingBlock /> : null}
        {list.error ? (
          <EmptyState
            icon="alert"
            title="تعذر تحميل المصروفات"
            action={
              <button type="button" className="btn secondary" onClick={list.reload}>
                إعادة المحاولة
              </button>
            }
          />
        ) : null}
        {list.data && !list.error ? (
          list.data.items.length === 0 ? (
            <EmptyState
              icon="wallet"
              title={filtered ? 'لا توجد مصروفات مطابقة' : 'لا توجد مصروفات مسجلة بعد'}
              action={
                !filtered ? (
                  <Link className="btn" to="/expenses/new">
                    إضافة مصروف
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="card-header">
                <h3>
                  {get('status') === 'VOIDED'
                    ? `${formatCount(list.data.meta.total)} مصروف ملغى`
                    : `الإجمالي (بدون الملغاة): ${money(list.data.filtered.activeTotal)}`}
                </h3>
                <span className="muted small">{formatCount(list.data.meta.total)} سجل</span>
              </div>
              <div className={`table-wrap${list.loading ? ' is-refreshing' : ''}`}>
                <table className="data stack-on-phone stack-on-tablet">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>التصنيف</th>
                      <th className="wrap">البيان</th>
                      <th className="num">المبلغ</th>
                      <th>طريقة الدفع</th>
                      <th>الموظف</th>
                      <th>الحالة</th>
                      <th>المرفق</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((e) => {
                      const voided = e.status === 'VOIDED';
                      return (
                        <tr key={e.id} {...rowLink(`/expenses/${e.id}`, undefined, voided ? 'row-voided' : '')}>
                          <td className="mono">{formatDate(e.expenseDate)}</td>
                          <td>{expenseCategoryLabel[e.category]}</td>
                          <td className="wrap primary-cell">
                            <Link to={`/expenses/${e.id}`}>{e.description}</Link>
                          </td>
                          <td className="num mono amount">
                            <strong>{formatAmount(e.amount)}</strong>
                          </td>
                          <td>
                            {paymentMethodLabel[e.paymentMethod]}
                            {e.transferType ? <div className="muted small">{transferTypeLabel[e.transferType]}</div> : null}
                          </td>
                          <td>{e.createdBy.fullName}</td>
                          <td>
                            <Badge tone={voided ? 'danger' : 'success'}>{expenseStatusLabel[e.status]}</Badge>
                          </td>
                          <td>{e.hasAttachment ? <Badge tone="info" dot={false}>مرفق</Badge> : <span className="muted">—</span>}</td>
                          <td>
                            <Link className="btn ghost sm" to={`/expenses/${e.id}`}>
                              <Icon name="eye" size={14} /> عرض
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination {...list.data.meta} onPage={(next) => update({ page: String(next) }, true)} />
            </>
          )
        ) : null}
      </div>
    </div>
  );
};
