import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardStats } from '../api/types';
import { api } from '../api/client';
import { useAsync } from '../lib/hooks';
import { useAuth } from '../auth/AuthContext';
import {
  formatAmount,
  formatCount,
  formatDate,
  formatDateTime,
  paymentStatusLabel,
  receiptNumberOf,
  tripPhaseLabel,
  tripStatusLabel,
  tripStatusTone,
} from '../lib/format';
import { Badge, EmptyState, Icon, LoadingBlock, PageHeader, StatCard } from '../ui/primitives';
import type { IconName } from '../ui/primitives';

const greeting = (date: Date): string => (date.getHours() < 12 ? 'صباح الخير' : 'مساء الخير');

/** Money as "250,000.00 جنيه"; counts always go through formatCount. */
const Money = ({ value }: { value: string }) => (
  // Amount + currency never split across lines (see .money-value).
  <span className="money-value">
    {formatAmount(value)} <span className="currency">جنيه</span>
  </span>
);

type QuickLink = { to: string; label: string; hint: string; icon: IconName };

const employeeActions: QuickLink[] = [
  { to: '/pilgrims/new', label: 'إضافة معتمر', hint: 'تسجيل معتمر جديد في رحلة', icon: 'pilgrim' },
  { to: '/delegates?new=1', label: 'إضافة مندوب', hint: 'مندوب جديد بياناته الأساسية', icon: 'users' },
  { to: '/trips?new=1', label: 'إنشاء رحلة', hint: 'رحلة جديدة بمواعيد السفر والعودة', icon: 'bus' },
  { to: '/payments/new', label: 'تسجيل دفعة', hint: 'إيصال ورقي مستلم من مندوب', icon: 'wallet' },
];

const managerActions: QuickLink[] = [
  { to: '/accounts', label: 'حسابات المناديب', hint: 'المطلوب والمدفوع والمتبقي لكل مندوب', icon: 'receipt' },
  { to: '/finance/movements', label: 'الحركات المالية', hint: 'الدفعات والإلغاءات والتسويات', icon: 'ledger' },
  { to: '/users', label: 'إدارة المستخدمين', hint: 'الحسابات والصلاحيات', icon: 'settings' },
  { to: '/reports', label: 'التقارير', hint: 'تقارير الرحلات والمناديب والدفعات', icon: 'report' },
];

const files = (n: number) => `${formatCount(n)} ملف ناقص`;

export const DashboardPage = () => {
  const { isManager } = useAuth();
  const [now] = useState(() => new Date());
  const { data, loading, error, reload } = useAsync<DashboardStats>(
    (signal) => api.get<DashboardStats>('/dashboard/stats', undefined, signal),
    [],
  );

  const header = (
    <PageHeader
      title="لوحة التحكم"
      subtitle={`${greeting(now)} — ${isManager ? 'متابعة العمليات والحسابات' : 'متابعة العمليات اليومية'}`}
      actions={
        <button type="button" className="btn secondary" onClick={reload} disabled={loading}>
          <Icon name="refresh" size={15} /> تحديث
        </button>
      }
    />
  );

  if (!data) {
    return (
      <div className="page">
        {header}
        {error ? (
          <div className="card">
            <EmptyState
              icon="alert"
              title="تعذر تحميل لوحة التحكم"
              description="تحقق من الاتصال ثم حاول مرة أخرى"
              action={
                <button type="button" className="btn" onClick={reload}>
                  <Icon name="refresh" size={15} /> إعادة المحاولة
                </button>
              }
            />
          </div>
        ) : (
          <LoadingBlock />
        )}
      </div>
    );
  }

  const { trips, pilgrims, delegates, documents, upcomingTrips, payments, finance } = data;

  return (
    <div className="page dashboard">
      {header}

      {documents.incomplete > 0 ? (
        <div className="alert warning mb-5">
          <div>
            <strong>{files(documents.incomplete)} يحتاج مراجعة</strong>
            معتمرون نشطون ينقصهم صورة الجواز أو الصورة الشخصية
          </div>
          <Link className="btn soft sm" to="/reports?tab=missing">
            عرض التقرير
          </Link>
        </div>
      ) : null}

      {/* Operations — both roles */}
      <div className="grid cols-3 mb-5">
        <StatCard
          label="الرحلات القادمة"
          value={formatCount(trips.upcoming)}
          hint="لم يبدأ السفر بعد"
          icon="bus"
        />
        <StatCard
          label="الرحلات الجارية الآن"
          value={formatCount(trips.ongoing)}
          hint="بدأ السفر ولم تنتهِ بعد"
          icon="clock"
          tone="info"
        />
        <StatCard
          label="المعتمرون النشطون"
          value={formatCount(pilgrims.active)}
          hint={pilgrims.cancelled > 0 ? `لا يشمل ${formatCount(pilgrims.cancelled)} مستبعد` : 'في جميع الرحلات'}
          icon="pilgrim"
        />
        <StatCard
          label="الملفات الناقصة"
          value={formatCount(documents.incomplete)}
          hint={documents.incomplete > 0 ? 'معتمر ملفه غير مكتمل' : 'كل الملفات مكتملة'}
          icon="file"
          tone={documents.incomplete > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="المناديب النشطون"
          value={formatCount(delegates.active)}
          hint={`من إجمالي ${formatCount(delegates.total)} مندوب`}
          icon="users"
        />
        <StatCard
          label="دفعات اليوم"
          value={formatCount(payments.todayCount)}
          hint={
            finance && payments.todayCount > 0 ? (
              <>
                بقيمة <Money value={finance.todayAmount} />
              </>
            ) : (
              'دفعة مسجلة بتاريخ اليوم'
            )
          }
          icon="wallet"
        />
      </div>

      {/* Company-wide money — manager only (the API returns null for employees) */}
      {finance ? (
        <div className="card mb-5">
          <div className="card-header">
            <h3>المتابعة المالية</h3>
            <Link className="btn ghost sm" to="/accounts">
              حسابات المناديب
            </Link>
          </div>
          <div className="card-body">
            <div className={`grid ${finance.creditDelegates > 0 ? 'cols-4' : 'cols-3'}`}>
              <StatCard
                label="إجمالي المطلوب من المناديب"
                value={<Money value={finance.totalRequired} />}
                hint="المعتمرون النشطون × سعر الفرد مع التسويات"
              />
              <StatCard
                label="إجمالي المدفوع"
                value={<Money value={finance.totalPaid} />}
                hint={`${formatCount(finance.paymentCount)} دفعة مسجلة، بعد خصم الاستردادات`}
                tone="success"
              />
              <StatCard
                label="إجمالي المتبقي"
                value={<Money value={finance.totalRemaining} />}
                hint={
                  finance.dueDelegates > 0
                    ? `على ${formatCount(finance.dueDelegates)} مندوب`
                    : 'لا يوجد مبالغ متبقية'
                }
                tone={finance.dueDelegates > 0 ? 'danger' : 'default'}
              />
              {finance.creditDelegates > 0 ? (
                <StatCard
                  label="له رصيد"
                  value={<Money value={finance.totalCredit} />}
                  hint={`لصالح ${formatCount(finance.creditDelegates)} مندوب`}
                  tone="info"
                />
              ) : null}
            </div>
            {/* Company expenses are separate from delegate money: own line, own page. */}
            <div className="row between dash-expenses">
              <span className="muted">
                مصروفات الشركة هذا الشهر: <strong className="mono">{formatAmount(finance.monthExpenses)} جنيه</strong>
              </span>
              <Link className="btn ghost sm" to="/expenses">
                المصروفات
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Nearest trips */}
      <div className="card mb-5">
        <div className="card-header">
          <h3>الرحلات القادمة والجارية</h3>
          <Link className="btn ghost sm" to="/trips">
            كل الرحلات
          </Link>
        </div>
        <div className="card-body flush">
          {upcomingTrips.length === 0 ? (
            <EmptyState
              icon="bus"
              title="لا توجد رحلات قادمة"
              description="أنشئ رحلة جديدة لتظهر هنا"
              action={
                <Link className="btn sm" to="/trips?new=1">
                  <Icon name="plus" size={14} /> إنشاء رحلة
                </Link>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data stack-on-phone">
                <thead>
                  <tr>
                    <th>الرحلة</th>
                    <th>تاريخ السفر</th>
                    <th className="num">المناديب</th>
                    <th className="num">المعتمرون النشطون</th>
                    <th className="num">الملفات الناقصة</th>
                    <th>الحالة</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingTrips.map((trip) => (
                    <tr key={trip.id}>
                      <td>
                        <Link to={`/trips/${trip.id}`}>
                          <strong>{trip.name}</strong>
                        </Link>
                      </td>
                      <td className="mono">{formatDate(trip.departureDate)}</td>
                      <td className="num">{formatCount(trip.delegateCount)}</td>
                      <td className="num">{formatCount(trip.activePilgrimCount)}</td>
                      <td className="num">
                        {trip.incompleteDocuments > 0 ? (
                          <Badge tone="warning">{formatCount(trip.incompleteDocuments)}</Badge>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={trip.phase === 'ONGOING' ? 'info' : 'default'} dot={false}>
                          {tripPhaseLabel[trip.phase]}
                        </Badge>{' '}
                        <Badge tone={tripStatusTone(trip.status)}>{tripStatusLabel[trip.status]}</Badge>
                      </td>
                      <td>
                        <Link className="btn ghost sm" to={`/trips/${trip.id}`}>
                          <Icon name="eye" size={14} /> عرض الرحلة
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid cols-2 mb-5">
        {/* Missing documents attention */}
        <div className="card">
          <div className="card-header">
            <h3>الملفات الناقصة</h3>
            <Link className="btn ghost sm" to="/reports?tab=missing">
              التقرير الكامل
            </Link>
          </div>
          <div className="card-body flush">
            {documents.incomplete === 0 ? (
              <EmptyState icon="check-circle" title="لا توجد ملفات ناقصة" description="كل المعتمرين النشطين ملفاتهم مكتملة" />
            ) : (
              <ul className="dash-list">
                {documents.topTrips.map((row) => (
                  <li key={row.tripId}>
                    <div className="dash-list-main">
                      <Link to={`/trips/${row.tripId}`}>
                        <strong>{row.tripName}</strong>
                      </Link>
                      <span className="muted small">
                        {formatDate(row.departureDate)} — {tripPhaseLabel[row.phase]}
                      </span>
                    </div>
                    <Badge tone="warning">{files(row.incomplete)}</Badge>
                  </li>
                ))}
                {documents.topTrips.length > 0 &&
                documents.incomplete > documents.topTrips.reduce((n, r) => n + r.incomplete, 0) ? (
                  <li className="muted small">والباقي في رحلات أخرى — راجع التقرير الكامل</li>
                ) : null}
              </ul>
            )}
          </div>
        </div>

        {/* Recent payments */}
        <div className="card">
          <div className="card-header">
            <h3>أحدث الدفعات</h3>
            <Link className="btn ghost sm" to="/payments">
              سجل الدفعات
            </Link>
          </div>
          <div className="card-body flush">
            {payments.recent.length === 0 ? (
              <EmptyState icon="wallet" title="لا توجد دفعات مسجلة بعد" />
            ) : (
              <ul className="dash-list">
                {payments.recent.map((p) => {
                  const voided = p.status === 'VOIDED';
                  return (
                    <li key={p.id} className={voided ? 'is-voided' : undefined}>
                      <div className="dash-list-main">
                        <strong>{p.delegate?.name ?? '—'}</strong>
                        <span className="muted small">
                          إيصال <span className="mono">{receiptNumberOf(p)}</span> — {formatDate(p.paymentDate)}
                        </span>
                        {voided && isManager && p.voidReason ? (
                          <span className="muted small">
                            سبب الإلغاء: {p.voidReason}
                            {p.voidedAt ? ` — ${formatDateTime(p.voidedAt)}` : ''}
                          </span>
                        ) : null}
                      </div>
                      <div className="dash-list-side">
                        <span className="mono amount">
                          <Money value={p.amount} />
                        </span>
                        {voided ? <Badge tone="danger">{paymentStatusLabel[p.status]}</Badge> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>إجراءات سريعة</h3>
        </div>
        <div className="card-body">
          <div className="grid cols-4">
            {(isManager ? managerActions : employeeActions).map((link) => (
              <Link key={link.to} to={link.to} className="quick-link">
                <span className="quick-icon">
                  <Icon name={link.icon} size={18} />
                </span>
                <span className="quick-body">
                  <span className="quick-title">{link.label}</span>
                  <span className="quick-hint">{link.hint}</span>
                </span>
                <Icon name="arrow-left" size={16} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
