import { Link } from 'react-router-dom';
import { fileUrl } from '../api/client';
import type {
  AccountAdjustmentRow,
  AccountStatus,
  AccountTripRow,
  DelegateAccount,
  PaymentRow,
} from '../api/types';
import {
  accountStatusLabel,
  accountTone,
  formatAmount,
  formatDate,
  formatDateTime,
  paymentMethodLabel,
  paymentStatusLabel,
  receiptNumberOf,
  transferTypeLabel,
  tripStatusLabel,
} from '../lib/format';
import { Badge, EmptyState, Icon } from '../ui/primitives';

/*
 * Shared "حساب المندوب" building blocks. Wording is deliberately simple:
 * إجمالي المطلوب / إجمالي المدفوع / المتبقي عليه / مسدد بالكامل / له رصيد.
 * Every figure comes from the API; nothing is recalculated here.
 */

const CURRENCY = 'جنيه';
const money = (value?: string | null) => `${formatAmount(value)} ${CURRENCY}`;

export const AccountStatusBadge = ({ status }: { status: AccountStatus }) => (
  <Badge tone={status === 'DUE' ? 'danger' : status === 'CREDIT' ? 'success' : 'default'}>
    {accountStatusLabel[status]}
  </Badge>
);

/** إجمالي المطلوب, إجمالي المدفوع and ONE balance state (no zero cards). */
export const AccountSummaryCards = ({ summary }: { summary?: DelegateAccount | null }) => {
  const balance = !summary
    ? { tone: 'accent-info', label: 'الحالة', value: '—', hint: '' }
    : summary.status === 'DUE'
      ? { tone: 'accent-danger', label: 'المتبقي عليه', value: money(summary.remaining), hint: 'لم يُسدد بعد' }
      : summary.status === 'CREDIT'
        ? { tone: 'accent-success', label: 'له رصيد', value: money(summary.credit), hint: 'مدفوع زيادة عن المطلوب' }
        : { tone: 'accent-info', label: 'الحالة', value: 'مسدد بالكامل', hint: 'لا يوجد مبلغ متبقٍ' };
  return (
    <div className="grid cols-3 account-summary" style={{ marginBottom: 16 }}>
      <div className="stat-card accent">
        <span className="label">إجمالي المطلوب</span>
        <span className="value mono">{money(summary?.totalRequired)}</span>
        <span className="hint">عدد المعتمرين النشطين × سعر الفرد</span>
      </div>
      <div className="stat-card accent-success">
        <span className="label">إجمالي المدفوع</span>
        <span className="value mono">{money(summary?.totalPaid)}</span>
        <span className="hint">الدفعات المسجلة فقط (بدون الملغاة)</span>
      </div>
      <div className={`stat-card ${balance.tone}`}>
        <span className="label">{balance.label}</span>
        <span className="value mono">{balance.value}</span>
        <span className="hint">{balance.hint}</span>
      </div>
    </div>
  );
};

/** Compact key/value version (used beside the payment form). */
export const AccountSummaryList = ({ summary }: { summary: DelegateAccount }) => (
  <dl className="kv">
    <dt>إجمالي المطلوب</dt>
    <dd className="mono">{money(summary.totalRequired)}</dd>
    <dt>إجمالي المدفوع</dt>
    <dd className="mono">{money(summary.totalPaid)}</dd>
    {summary.status === 'CREDIT' ? (
      <>
        <dt>له رصيد</dt>
        <dd className="mono">
          <span className="balance-pill credit">{money(summary.credit)}</span>
        </dd>
      </>
    ) : summary.status === 'SETTLED' ? (
      <>
        <dt>الحالة</dt>
        <dd>مسدد بالكامل</dd>
      </>
    ) : (
      <>
        <dt>المتبقي عليه</dt>
        <dd className="mono">
          <span className={`balance-pill ${accountTone(summary.status)}`}>{money(summary.remaining)}</span>
        </dd>
      </>
    )}
  </dl>
);

/** Opens the protected receipt scan (authenticated cookie request). */
export const ReceiptScanLink = ({ payment }: { payment: Pick<PaymentRow, 'id' | 'hasReceiptScan'> }) =>
  payment.hasReceiptScan ? (
    <a
      className="btn ghost sm"
      href={fileUrl(`/payments/${payment.id}/receipt-scan`)}
      target="_blank"
      rel="noreferrer"
    >
      <Icon name="eye" size={14} /> عرض الإيصال
    </a>
  ) : (
    <span className="muted small">لا توجد صورة</span>
  );

const plural = (count: number) => (count === 1 ? 'معتمر واحد' : count === 2 ? 'معتمران' : `${count} معتمرين`);

/**
 * تفاصيل المستحقات — how إجمالي المطلوب is made up (not a ledger): one row per
 * trip (active pilgrims × price per person), manager corrections if any, and
 * a total that equals the summary exactly.
 */
export const AccountBreakdown = ({ trips, summary }: { trips: AccountTripRow[]; summary: DelegateAccount }) => {
  const hasCorrections = Number(summary.correctionsNet) !== 0;
  if (trips.length === 0 && !hasCorrections) {
    return <EmptyState title="لا توجد مستحقات" description="لم يُسند هذا المندوب إلى أي رحلة بعد" />;
  }
  const signedCorrection = summary.correctionsNet.startsWith('-')
    ? `- ${money(summary.correctionsNet.slice(1))}`
    : `+ ${money(summary.correctionsNet)}`;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>الرحلة</th>
            <th className="num">المعتمرون النشطون</th>
            <th className="num">سعر الفرد</th>
            <th className="num">إجمالي الرحلة</th>
          </tr>
        </thead>
        <tbody>
          {trips.map((row) => (
            <tr key={row.tripId}>
              <td>
                <Link to={`/trips/${row.tripId}`}>{row.tripName}</Link>
                <div className="muted small">
                  {formatDate(row.departureDate)} — {tripStatusLabel[row.tripStatus]}
                </div>
              </td>
              <td className="num">{plural(row.activePilgrimCount)}</td>
              <td className="num mono">{money(row.pricePerPerson)}</td>
              <td className="num mono">
                <strong>{money(row.requiredAmount)}</strong>
              </td>
            </tr>
          ))}
          {hasCorrections ? (
            <tr>
              <td colSpan={3}>
                تسويات الإدارة
                <div className="muted small">إضافة أو خصم سجّله مدير النظام على الحساب</div>
              </td>
              <td className="num mono">{signedCorrection}</td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="total-row">
            <td colSpan={3}>
              <strong>إجمالي المطلوب</strong>
            </td>
            <td className="num mono">
              <strong>{money(summary.totalRequired)}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

/**
 * سجل الدفعات — newest first. Voided payments stay visible but look different
 * and are not part of إجمالي المدفوع. Void details and the void action are
 * manager-only (the API enforces the action itself).
 */
export const AccountPaymentsTable = ({
  payments,
  isManager = false,
  onVoid,
  highlightId,
}: {
  payments: PaymentRow[];
  isManager?: boolean;
  onVoid?: (payment: PaymentRow) => void;
  highlightId?: string | null;
}) => {
  if (payments.length === 0) {
    return <EmptyState title="لا توجد دفعات" description="لم تُسجَّل أي دفعة لهذا المندوب بعد" />;
  }
  const newestFirst = [...payments].sort(
    (a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>تاريخ الدفع</th>
            <th className="num">المبلغ</th>
            <th>رقم الإيصال</th>
            <th>طريقة الدفع</th>
            <th>سجّلها</th>
            <th>الحالة</th>
            <th>الإيصال</th>
            {isManager && onVoid ? <th></th> : null}
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((payment) => {
            const voided = payment.status === 'VOIDED';
            return (
              <tr
                key={payment.id}
                className={`${voided ? 'row-voided' : ''}${payment.id === highlightId ? ' row-highlight' : ''}`}
              >
                <td className="mono">{formatDate(payment.paymentDate)}</td>
                <td className="num mono amount">
                  <strong>{money(payment.amount)}</strong>
                </td>
                <td className="mono">{receiptNumberOf(payment)}</td>
                <td>
                  {paymentMethodLabel[payment.paymentMethod]}
                  {payment.transferType || payment.referenceNumber ? (
                    <div className="muted small">
                      {payment.transferType ? transferTypeLabel[payment.transferType] : ''}
                      {payment.transferType && payment.referenceNumber ? ' — ' : ''}
                      {payment.referenceNumber ? <span className="mono">{payment.referenceNumber}</span> : null}
                    </div>
                  ) : null}
                </td>
                <td>{payment.createdBy?.fullName ?? '—'}</td>
                <td>
                  <Badge tone={voided ? 'danger' : 'success'}>{paymentStatusLabel[payment.status]}</Badge>
                  {voided && isManager ? (
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
                {isManager && onVoid ? (
                  <td>
                    {!voided ? (
                      <button type="button" className="btn ghost sm" onClick={() => onVoid(payment)}>
                        إلغاء الدفعة
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/** Manager-only list of exceptional refunds / corrections. */
export const AccountAdjustmentsTable = ({ adjustments }: { adjustments: AccountAdjustmentRow[] }) =>
  adjustments.length === 0 ? (
    <EmptyState title="لا توجد تسويات" description="لم تُسجَّل أي تسوية أو استرداد لهذا المندوب" />
  ) : (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>النوع</th>
            <th className="wrap">السبب</th>
            <th className="num">المبلغ</th>
            <th>الأثر</th>
            <th>بواسطة</th>
          </tr>
        </thead>
        <tbody>
          {adjustments.map((row) => (
            <tr key={row.id}>
              <td className="mono">{formatDate(row.effectiveDate)}</td>
              <td>{row.type === 'REFUND' ? 'استرداد للمندوب' : 'تسوية إدارية'}</td>
              <td className="wrap">{row.reason}</td>
              <td className="num mono">{money(row.amount)}</td>
              <td>
                <Badge tone={row.effect === 'INCREASE' ? 'warning' : 'info'}>
                  {row.effect === 'INCREASE' ? 'يزيد المتبقي عليه' : 'يقلل المتبقي عليه'}
                </Badge>
              </td>
              <td>{row.performedBy.fullName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
