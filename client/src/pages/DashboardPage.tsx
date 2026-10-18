import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardStats } from '../api/types';
import { api } from '../api/client';
import { useAsync } from '../lib/hooks';
import { formatAmount, formatCount, formatDateTime } from '../lib/format';
import { Icon, LoadingBlock, PageHeader, StatCard } from '../ui/primitives';
import type { IconName } from '../ui/primitives';

const greeting = (date: Date): string => {
  const hour = date.getHours();
  if (hour < 12) return 'صباح الخير';
  if (hour < 17) return 'مساء الخير';
  return 'مساء الخير';
};

const kpis = (stats: DashboardStats) => [
  {
    label: 'الرحلات المفتوحة',
    value: `${formatCount(stats.openTrips)} / ${formatCount(stats.totalTrips)}`,
    hint: 'رحلات مفتوحة من إجمالي الرحلات',
    icon: 'bus' as IconName,
    tone: 'default' as const,
  },
  {
    label: 'إجمالي المعتمرون',
    value: formatCount(stats.totalPilgrims),
    hint: 'مسجلون في جميع الرحلات',
    icon: 'pilgrim' as IconName,
    tone: 'default' as const,
  },
  {
    label: 'المندوبون النشطون',
    value: `${formatCount(stats.activeDelegates)} / ${formatCount(stats.totalDelegates)}`,
    hint: 'مندوبون نشطون من إجمالي المندوبين',
    icon: 'users' as IconName,
    tone: 'default' as const,
  },
  {
    label: 'المحصّل من الدفعات',
    value: formatAmount(stats.totalCollected),
    hint: `${formatCount(stats.paymentCount)} دفعة مسجلة`,
    icon: 'wallet' as IconName,
    tone: 'success' as const,
  },
  {
    label: 'المتبقي على المندوبين',
    value: formatAmount(stats.totalOutstanding),
    hint: 'إجمالي المتبقي على كل المندوبين',
    icon: 'alert' as IconName,
    tone: 'danger' as const,
  },
  {
    label: 'وثائق ناقصة',
    value: formatCount(stats.incompleteDocuments),
    hint: 'معتمرون بوثائق غير مكتملة',
    icon: 'file' as IconName,
    tone: 'warning' as const,
  },
];

const quickLinks = [
  { to: '/pilgrims/new', label: 'إضافة معتمر', hint: 'تسجيل معتمر جديد في رحلة', icon: 'plus' as IconName },
  { to: '/payments/new', label: 'تسجيل دفعة', hint: 'تسجيل إيصال ورقي مستلم من مندوب', icon: 'wallet' as IconName },
  { to: '/reports?tab=missing', label: 'الوثائق الناقصة', hint: 'تقرير الوثائق غير المكتملة', icon: 'alert' as IconName },
  { to: '/payments', label: 'سجل الدفعات', hint: 'الدفعات وأرقام الإيصالات الورقية', icon: 'ledger' as IconName },
];

export const DashboardPage = () => {
  const [now] = useState(() => new Date());
  const { data, loading, error } = useAsync<DashboardStats>(
    (signal) => api.get<DashboardStats>('/dashboard/stats', undefined, signal),
    [],
  );

  return (
    <div className="page">
      <PageHeader
        title="لوحة التحكم"
        subtitle={`${greeting(now)} — آخر تحديث ${formatDateTime(now.toISOString())}`}
        actions={
          <>
            <Link className="btn secondary" to="/pilgrims/new">
              <Icon name="plus" size={15} /> إضافة معتمر
            </Link>
            <Link className="btn" to="/payments/new">
              <Icon name="wallet" size={15} /> تسجيل دفعة
            </Link>
          </>
        }
      />

      {data && data.incompleteDocuments > 0 ? (
        <div className="alert warning mb-5">
          <div>
            <strong>يوجد {data.incompleteDocuments} معتمر بوثائق ناقصة</strong>
            راجع تقرير الوثائق الناقصة قبل إغلاق الرحلات
          </div>
          <Link className="btn soft sm" to="/reports?tab=missing">
            فتح التقرير
          </Link>
        </div>
      ) : null}

      {loading ? <LoadingBlock /> : null}
      {error ? <div className="alert error">تعذر تحميل الإحصائيات</div> : null}

      {data ? (
        <div className="grid cols-3 mb-5">
          {kpis(data).map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              hint={card.hint}
              icon={card.icon}
              tone={card.tone}
            />
          ))}
        </div>
      ) : null}

      <div className="card">
        <div className="card-header">
          <h3>إجراءات سريعة</h3>
          <span className="muted small">اختصارات لأكثر المهام استخداماً</span>
        </div>
        <div className="card-body">
          <div className="grid cols-4">
            {quickLinks.map((link) => (
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
