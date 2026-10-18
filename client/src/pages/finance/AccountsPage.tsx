import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { AccountStatus, DelegateAccountList } from '../../api/types';
import { useAsync, useListState } from '../../lib/hooks';
import { formatAmount, formatDate } from '../../lib/format';
import {
  EmptyState,
  Field,
  Icon,
  LoadingBlock,
  PageHeader,
  Pagination,
  Tabs,
  TextInput,
} from '../../ui/primitives';
import { AccountStatusBadge, Money } from '../../components/DelegateAccount';

const TABS: Array<{ id: '' | AccountStatus; label: string }> = [
  { id: '', label: 'الكل' },
  { id: 'DUE', label: 'عليه مبلغ' },
  { id: 'SETTLED', label: 'مسدد' },
  { id: 'CREDIT', label: 'له رصيد' },
];

/**
 * حسابات المناديب: who owes what. Filtering, ordering (amounts owed first) and
 * pagination happen on the server; figures are never recalculated here.
 */
export const AccountsPage = () => {
  const list = useListState();
  const [accountStatus, setAccountStatus] = useState<'' | AccountStatus>('');

  const { data, loading, error } = useAsync<DelegateAccountList>(
    (signal) =>
      api.get<DelegateAccountList>(
        '/finance/delegates',
        {
          page: list.page,
          pageSize: list.pageSize,
          search: list.debouncedSearch || undefined,
          accountStatus: accountStatus || undefined,
        },
        signal,
      ),
    [list.page, list.pageSize, list.debouncedSearch, accountStatus],
  );

  return (
    <div className="page">
      <PageHeader
        title="حسابات المناديب"
        subtitle="المطلوب من كل مندوب، وما دفعه، والمتبقي عليه — المناديب الذين عليهم مبالغ أولاً"
        actions={
          <Link className="btn" to="/payments/new">
            <Icon name="plus" size={15} /> تسجيل دفعة
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
                placeholder="اسم المندوب أو رقم الهاتف"
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="filter-tabs">
        <Tabs
          items={TABS.map((tab) => ({
            id: tab.id || 'ALL',
            label: tab.label,
            count: data?.counts[tab.id || 'ALL'],
          }))}
          active={accountStatus || 'ALL'}
          onChange={(id) => {
            setAccountStatus(id === 'ALL' ? '' : (id as AccountStatus));
            list.setPage(1);
          }}
        />
      </div>

      <div className="card">
        {loading && !data ? <LoadingBlock /> : null}
        {error ? <EmptyState title="تعذر تحميل حسابات المناديب" /> : null}
        {data ? (
          data.items.length === 0 ? (
            <EmptyState title={accountStatus || list.debouncedSearch ? 'لا توجد حسابات مطابقة' : 'لا توجد حسابات'} />
          ) : (
            <>
              <div className="table-wrap accounts-table">
                <table className="data">
                  <thead>
                    <tr>
                      <th>المندوب</th>
                      <th className="num">إجمالي المطلوب</th>
                      <th className="num">إجمالي المدفوع</th>
                      <th className="num">المتبقي عليه</th>
                      <th className="num">له رصيد</th>
                      <th>الحالة</th>
                      <th>آخر دفعة</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link to={`/accounts/${row.id}`}>
                            <strong>{row.name}</strong>
                          </Link>
                          <div className="muted small">
                            <span className="mono-inline">{row.phone}</span>
                          </div>
                        </td>
                        <td className="num mono">{formatAmount(row.account.totalRequired)}</td>
                        <td className="num mono">{formatAmount(row.account.totalPaid)}</td>
                        <td className="num mono">
                          {row.account.status === 'DUE' ? (
                            <span className="balance-pill debt">{formatAmount(row.account.remaining)}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="num mono">
                          {row.account.status === 'CREDIT' ? (
                            <span className="balance-pill credit">{formatAmount(row.account.credit)}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <AccountStatusBadge status={row.account.status} />
                        </td>
                        <td className="mono">{row.lastPaymentDate ? formatDate(row.lastPaymentDate) : '—'}</td>
                        <td>
                          <Link className="btn ghost sm" to={`/accounts/${row.id}`}>
                            <Icon name="eye" size={14} /> عرض الحساب
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Tablets / phones: one compact card per delegate (same figures). */}
              <ul className="account-cards">
                {data.items.map((row) => (
                  <AccountCard key={row.id} row={row} />
                ))}
              </ul>
              <Pagination {...data.meta} onPage={list.setPage} />
            </>
          )
        ) : null}
      </div>
    </div>
  );
};

/** The balance that matters for this account: owed, credit, or settled. */
const mainBalance = (account: DelegateAccountList['items'][number]['account']) =>
  account.status === 'CREDIT'
    ? { label: 'له رصيد', value: account.credit, tone: 'credit' }
    : account.status === 'DUE'
      ? { label: 'المتبقي عليه', value: account.remaining, tone: 'debt' }
      : { label: 'المتبقي عليه', value: account.remaining, tone: 'settled' };

const AccountCard = ({ row }: { row: DelegateAccountList['items'][number] }) => {
  const balance = mainBalance(row.account);
  return (
    <li className="account-card">
      <div className="account-card-head">
        <div className="account-card-id">
          <Link to={`/accounts/${row.id}`} className="account-card-name">
            {row.name}
          </Link>
          <span className="muted small mono-inline">{row.phone}</span>
        </div>
        <AccountStatusBadge status={row.account.status} />
      </div>
      <div className="account-card-balance">
        <span className="muted small">{balance.label}</span>
        <span className={`balance-pill ${balance.tone}`}>
          <Money value={balance.value} />
        </span>
      </div>
      <dl className="account-card-figures">
        <div>
          <dt>إجمالي المطلوب</dt>
          <dd>
            <span className="mono-inline">{formatAmount(row.account.totalRequired)}</span>
          </dd>
        </div>
        <div>
          <dt>إجمالي المدفوع</dt>
          <dd>
            <span className="mono-inline">{formatAmount(row.account.totalPaid)}</span>
          </dd>
        </div>
      </dl>
      <div className="account-card-foot">
        <span className="muted small">
          آخر دفعة: <span className="mono-inline">{row.lastPaymentDate ? formatDate(row.lastPaymentDate) : 'لا توجد'}</span>
        </span>
        <Link className="btn secondary sm" to={`/accounts/${row.id}`}>
          <Icon name="eye" size={14} /> عرض الحساب
        </Link>
      </div>
    </li>
  );
};
