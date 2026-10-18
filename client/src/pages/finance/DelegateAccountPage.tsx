import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, download } from '../../api/client';
import type { DelegateAccountStatement, PaymentRow } from '../../api/types';
import { useAsync } from '../../lib/hooks';
import { useAuth } from '../../auth/AuthContext';
import { formatAmount } from '../../lib/format';
import {
  AccountAdjustmentsTable,
  AccountBreakdown,
  AccountPaymentsTable,
  AccountStatusBadge,
  AccountSummaryCards,
} from '../../components/DelegateAccount';
import { VoidPaymentModal } from '../../components/VoidPaymentModal';
import { Breadcrumbs, EmptyState, Icon, LoadingBlock, PageHeader } from '../../ui/primitives';

/**
 * حساب المندوب: summary, how the required amount is made up, payment history
 * and — for managers only — adjustments and controls. Every figure comes from
 * the statement API (the same source as the PDF / Excel exports).
 */
export const DelegateAccountPage = () => {
  const { delegateId = '' } = useParams();
  const { isManager } = useAuth();
  const location = useLocation();
  // Set by the payment form after recording a payment from this account.
  const highlightId = (location.state as { paymentId?: string } | null)?.paymentId ?? null;
  const [voiding, setVoiding] = useState<PaymentRow | null>(null);

  const account = useAsync<DelegateAccountStatement>(
    (signal) =>
      api.get<DelegateAccountStatement>(`/finance/delegates/${delegateId}/statement`, undefined, signal),
    [delegateId],
  );

  if (account.loading && !account.data)
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  if (account.error || !account.data)
    return (
      <div className="page">
        <Breadcrumbs items={[{ label: 'حسابات المناديب', to: '/accounts' }, { label: 'الحساب' }]} />
        <EmptyState
          title="تعذر تحميل حساب المندوب"
          action={
            <Link className="btn secondary" to="/accounts">
              رجوع لحسابات المناديب
            </Link>
          }
        />
      </div>
    );

  const data = account.data;
  const voidedCount = data.payments.filter((p) => p.status === 'VOIDED').length;

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: 'حسابات المناديب', to: '/accounts' }, { label: data.delegate.name }]} />
      <PageHeader
        title={data.delegate.name}
        subtitle={data.delegate.phone}
        actions={
          <>
            <Link className="btn" to={`/accounts/${delegateId}/payments/new`}>
              <Icon name="wallet" size={15} /> تسجيل دفعة
            </Link>
            <button
              type="button"
              className="btn secondary"
              onClick={() => download(`/reports/account-statement/${delegateId}/pdf`)}
            >
              <Icon name="download" size={15} /> كشف الحساب PDF
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => download(`/reports/account-statement/${delegateId}/excel`)}
            >
              <Icon name="download" size={15} /> Excel
            </button>
            <Link className="btn ghost" to={`/delegates/${delegateId}`}>
              <Icon name="users" size={15} /> ملف المندوب
            </Link>
          </>
        }
      />

      <AccountSummaryCards summary={data.summary} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>تفاصيل المستحقات</h3>
          <AccountStatusBadge status={data.summary.status} />
        </div>
        <div className="card-body flush">
          <AccountBreakdown trips={data.trips} summary={data.summary} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>سجل الدفعات</h3>
          <span className="muted small">
            {data.payments.length} دفعة
            {voidedCount > 0 ? ` — ${voidedCount} ملغاة لا تُحتسب ضمن المدفوع` : ''}
          </span>
        </div>
        {Number(data.summary.refundsTotal) !== 0 ? (
          <div className="card-body" style={{ paddingBottom: 0 }}>
            <div className="alert info">
              إجمالي المدفوع بعد خصم استردادات للمندوب قيمتها {formatAmount(data.summary.refundsTotal)} جنيه.
            </div>
          </div>
        ) : null}
        <div className="card-body flush">
          <AccountPaymentsTable
            payments={data.payments}
            isManager={isManager}
            onVoid={isManager ? setVoiding : undefined}
            highlightId={highlightId}
          />
        </div>
      </div>

      {isManager && data.adjustments ? (
        <div className="card">
          <div className="card-header">
            <h3>التسويات والاستردادات</h3>
            <div className="row">
              <Link className="btn ghost sm" to={`/finance/movements?delegateId=${delegateId}`}>
                سجل الحركات المالية
              </Link>
              <Link className="btn ghost sm" to="/finance/adjustments">
                إدارة التسويات
              </Link>
            </div>
          </div>
          <div className="card-body flush">
            <AccountAdjustmentsTable adjustments={data.adjustments} />
          </div>
        </div>
      ) : null}

      {voiding ? (
        <VoidPaymentModal payment={voiding} onClose={() => setVoiding(null)} onDone={account.reload} />
      ) : null}
    </div>
  );
};
