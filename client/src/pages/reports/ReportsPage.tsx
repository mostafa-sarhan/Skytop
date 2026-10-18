import { Fragment, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, download } from '../../api/client';
import type {
  DelegateAccount,
  DelegateTripPilgrimsReport,
  MissingDocumentsReport,
  PaymentReport,
  PilgrimFilterOptions,
  TripDetail,
  TripPilgrimsReport,
} from '../../api/types';
import { useAsync } from '../../lib/hooks';
import {
  documentStatusLabel,
  formatAmount,
  formatCount,
  formatDate,
  paymentMethodLabel,
  paymentStatusLabel,
  tripStatusLabel,
} from '../../lib/format';
import { Badge, EmptyState, Field, Icon, LoadingBlock, PageHeader, SelectInput, TextInput } from '../../ui/primitives';
import { PassengerListExport } from '../../components/PassengerListExport';
import { AccountSummaryList } from '../../components/DelegateAccount';

type ReportId = 'trip' | 'delegate-trip' | 'missing' | 'statement' | 'payments';

const GROUPS: Array<{ title: string; items: Array<{ id: ReportId; label: string; hint: string; icon: 'bus' | 'users' | 'alert' | 'receipt' | 'wallet' }> }> = [
  {
    title: 'تشغيل الرحلات',
    items: [
      { id: 'trip', label: 'كشف معتمري رحلة', hint: 'كل المعتمرين النشطين في الرحلة مقسّمين حسب المندوب', icon: 'bus' },
      { id: 'delegate-trip', label: 'كشف معتمري مندوب داخل رحلة', hint: 'معتمرو مندوب واحد في رحلة واحدة — للطباعة والتسليم', icon: 'users' },
      { id: 'missing', label: 'كشف النواقص', hint: 'من ينقصه صورة جواز السفر أو الصورة الشخصية', icon: 'alert' },
    ],
  },
  {
    title: 'الحسابات',
    items: [
      { id: 'statement', label: 'كشف حساب مندوب', hint: 'المطلوب والمدفوع والمتبقي — نفس أرقام صفحة الحساب', icon: 'receipt' },
      { id: 'payments', label: 'سجل الدفعات', hint: 'الإيصالات الورقية المسجلة لفترة أو لمندوب', icon: 'wallet' },
    ],
  },
];

const ExportButtons = ({ path, query }: { path: string; query: Record<string, string | undefined> }) => (
  <div className="row">
    <button type="button" className="btn secondary sm" onClick={() => download(`${path}/excel`, query)}>
      <Icon name="download" size={14} /> Excel
    </button>
    <button type="button" className="btn sm" onClick={() => download(`${path}/pdf`, query)}>
      <Icon name="download" size={14} /> PDF
    </button>
  </div>
);

const LoadState = ({ loading, error }: { loading: boolean; error: unknown }) =>
  loading ? <LoadingBlock /> : error ? <EmptyState icon="alert" title="تعذر تحميل التقرير" /> : null;

const tripLabel = (trip: { name: string; departureDate: string }) => `${trip.name} — ${formatDate(trip.departureDate)}`;

export const ReportsPage = () => {
  const [params, setParams] = useSearchParams();
  const known: ReportId[] = ['trip', 'delegate-trip', 'missing', 'statement', 'payments'];
  const report = (known.find((id) => id === params.get('tab')) ?? 'trip') as ReportId;
  const setReport = (next: ReportId) => {
    const search = new URLSearchParams(params);
    search.set('tab', next);
    setParams(search, { replace: true });
  };

  const options = useAsync<PilgrimFilterOptions>(
    (signal) => api.get<PilgrimFilterOptions>('/pilgrims/filter-options', undefined, signal),
    [],
  );
  const trips = options.data?.trips ?? [];
  const delegates = options.data?.delegates ?? [];
  const active = GROUPS.flatMap((g) => g.items).find((item) => item.id === report)!;

  return (
    <div className="page">
      <PageHeader title="التقارير" subtitle="اختر التقرير، حدد الرحلة أو المندوب، ثم حمّله PDF للطباعة أو Excel" />

      <div className="report-groups">
        {GROUPS.map((group) => (
          <section key={group.title} className="report-group">
            <h2>{group.title}</h2>
            <div className="report-choices" role="tablist">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === report}
                  className={`report-choice${item.id === report ? ' active' : ''}`}
                  onClick={() => setReport(item.id)}
                >
                  <Icon name={item.icon} size={18} />
                  <span>
                    <strong>{item.label}</strong>
                    <span className="small muted">{item.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <h2 className="report-title">{active.label}</h2>
      {report === 'trip' ? <TripReport trips={trips} /> : null}
      {report === 'delegate-trip' ? <DelegateTripReport trips={trips} /> : null}
      {report === 'missing' ? <MissingReport trips={trips} delegates={delegates} /> : null}
      {report === 'statement' ? <StatementReport delegates={delegates} /> : null}
      {report === 'payments' ? <PaymentsReport delegates={delegates} /> : null}
    </div>
  );
};

type TripOption = PilgrimFilterOptions['trips'][number];
type DelegateOption = PilgrimFilterOptions['delegates'][number];

const PassengerTable = ({ rows, withDelegate }: { rows: TripPilgrimsReport['rows'] | DelegateTripPilgrimsReport['rows']; withDelegate?: boolean }) => {
  // A group header before the first row of each delegate (trip list only).
  const delegateOf = (row: (typeof rows)[number]) => (withDelegate && 'delegateName' in row ? row.delegateName : '');
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>م</th>
            <th>الاسم</th>
            <th>المهنة</th>
            <th>العنوان</th>
            <th>رقم جواز السفر</th>
            <th>الرقم القومي</th>
            <th>حالة المستندات</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const delegateName = delegateOf(row);
            const header = Boolean(delegateName) && (i === 0 || delegateOf(rows[i - 1]!) !== delegateName);
            return (
              <Fragment key={`${row.passportNumber}-${row.index}`}>
                {header ? (
                  <tr className="group-row">
                    <td colSpan={7}>المندوب: {delegateName}</td>
                  </tr>
                ) : null}
                <tr>
                  <td className="mono">{row.index}</td>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>{row.job || '—'}</td>
                  <td className="wrap">{row.address || '—'}</td>
                  <td className="mono">{row.passportNumber}</td>
                  <td className="mono">{row.nationalId || '—'}</td>
                  <td>
                    <Badge tone={row.documentStatus === 'COMPLETE' ? 'success' : 'warning'}>
                      {documentStatusLabel[row.documentStatus]}
                    </Badge>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const TripReport = ({ trips }: { trips: TripOption[] }) => {
  const [tripId, setTripId] = useState('');
  const [exporting, setExporting] = useState(false);
  const data = useAsync<TripPilgrimsReport | null>(
    (signal) => (tripId ? api.get<TripPilgrimsReport>('/reports/trip-pilgrims', { tripId }, signal) : Promise.resolve(null)),
    [tripId],
  );
  return (
    <div className="stack">
      <div className="card">
        <div className="card-body">
          <div className="filters">
            <Field label="الرحلة" required>
              <SelectInput value={tripId} onChange={(event) => setTripId(event.target.value)}>
                <option value="">اختر الرحلة</option>
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {tripLabel(trip)}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {data.data ? (
              <button type="button" className="btn" onClick={() => setExporting(true)}>
                <Icon name="download" size={15} /> طباعة / تصدير الكشف
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="card">
        {!tripId ? (
          <EmptyState icon="bus" title="اختر رحلة" description="لعرض كشف معتمريها النشطين وتصديره" />
        ) : !data.data ? (
          <LoadState loading={data.loading} error={data.error} />
        ) : (
          <>
            <div className="card-header">
              <div>
                <h3>{data.data.trip.name}</h3>
                <div className="muted small">
                  السفر {formatDate(data.data.trip.departureDate)} — العودة {formatDate(data.data.trip.returnDate)} — {tripStatusLabel[data.data.trip.status]}
                </div>
              </div>
              <div className="row">
                <Badge tone="primary">{formatCount(data.data.summary.total)} معتمر</Badge>
                <Badge>{formatCount(data.data.summary.delegates)} مندوب</Badge>
                {data.data.summary.incompleteDocuments > 0 ? (
                  <Badge tone="warning">{formatCount(data.data.summary.incompleteDocuments)} ملف ناقص</Badge>
                ) : null}
              </div>
            </div>
            {data.data.rows.length === 0 ? (
              <EmptyState title="لا يوجد معتمرون نشطون في هذه الرحلة" />
            ) : (
              <PassengerTable rows={data.data.rows} withDelegate />
            )}
          </>
        )}
      </div>
      {exporting && data.data ? (
        <PassengerListExport
          title="كشف معتمري الرحلة"
          description={`${data.data.trip.name}: ${data.data.summary.total} معتمر نشط مقسّمين حسب المندوب. المستبعدون لا يظهرون في الكشف.`}
          endpoint="/reports/trip-pilgrims"
          query={{ tripId }}
          onClose={() => setExporting(false)}
        />
      ) : null}
    </div>
  );
};

const DelegateTripReport = ({ trips }: { trips: TripOption[] }) => {
  const [tripId, setTripId] = useState('');
  const [delegateId, setDelegateId] = useState('');
  const [exporting, setExporting] = useState(false);
  // Only the delegates assigned to the chosen trip.
  const trip = useAsync<TripDetail | null>(
    (signal) => (tripId ? api.get<TripDetail>(`/trips/${tripId}`, undefined, signal) : Promise.resolve(null)),
    [tripId],
  );
  const assigned = trip.data?.delegates ?? [];
  const selected = assigned.some((row) => row.delegate.id === delegateId) ? delegateId : '';
  const data = useAsync<DelegateTripPilgrimsReport | null>(
    (signal) =>
      tripId && selected
        ? api.get<DelegateTripPilgrimsReport>('/reports/delegate-trip-pilgrims', { tripId, delegateId: selected }, signal)
        : Promise.resolve(null),
    [tripId, selected],
  );
  return (
    <div className="stack">
      <div className="card">
        <div className="card-body">
          <div className="filters">
            <Field label="الرحلة" required>
              <SelectInput value={tripId} onChange={(event) => setTripId(event.target.value)}>
                <option value="">اختر الرحلة</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tripLabel(t)}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="المندوب" required hint={tripId && trip.data && assigned.length === 0 ? 'لا يوجد مناديب في هذه الرحلة' : undefined}>
              <SelectInput value={selected} onChange={(event) => setDelegateId(event.target.value)} disabled={!trip.data}>
                <option value="">{tripId ? 'اختر المندوب' : 'اختر الرحلة أولاً'}</option>
                {assigned.map((row) => (
                  <option key={row.delegate.id} value={row.delegate.id}>
                    {row.delegate.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {data.data ? (
              <button type="button" className="btn" onClick={() => setExporting(true)}>
                <Icon name="download" size={15} /> طباعة / تصدير الكشف
              </button>
            ) : null}
          </div>
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            يمكن طباعة هذا الكشف مباشرة من صفحة معتمري المندوب في الرحلة (المناديب ← المندوب ← الرحلة).
          </p>
        </div>
      </div>
      <div className="card">
        {!tripId || !selected ? (
          <EmptyState icon="users" title="اختر الرحلة ثم المندوب" description="لعرض كشف معتمري المندوب في هذه الرحلة" />
        ) : !data.data ? (
          <LoadState loading={data.loading} error={data.error} />
        ) : (
          <>
            <div className="card-header">
              <div>
                <h3>
                  {data.data.delegate.name} — {data.data.trip.name}
                </h3>
                <div className="muted small">
                  السفر {formatDate(data.data.trip.departureDate)} — العودة {formatDate(data.data.trip.returnDate)}
                </div>
              </div>
              <div className="row">
                <Badge tone="primary">{formatCount(data.data.summary.total)} معتمر</Badge>
                <Link className="btn ghost sm" to={`/delegates/${data.data.delegate.id}/trips/${data.data.trip.id}/pilgrims`}>
                  فتح صفحة المعتمرين
                </Link>
              </div>
            </div>
            {data.data.rows.length === 0 ? (
              <EmptyState title="لا يوجد معتمرون نشطون لهذا المندوب في الرحلة" />
            ) : (
              <PassengerTable rows={data.data.rows} />
            )}
          </>
        )}
      </div>
      {exporting && data.data ? (
        <PassengerListExport
          title="كشف معتمري المندوب"
          description={`${data.data.delegate.name} — ${data.data.trip.name}: ${data.data.summary.total} معتمر نشط. المستبعدون لا يظهرون في الكشف.`}
          endpoint="/reports/delegate-trip-pilgrims"
          query={{ tripId, delegateId: selected }}
          onClose={() => setExporting(false)}
        />
      ) : null}
    </div>
  );
};

const MissingReport = ({ trips, delegates }: { trips: TripOption[]; delegates: DelegateOption[] }) => {
  const [tripId, setTripId] = useState('');
  const [delegateId, setDelegateId] = useState('');
  const query = { tripId: tripId || undefined, delegateId: delegateId || undefined };
  const data = useAsync<MissingDocumentsReport>(
    (signal) => api.get<MissingDocumentsReport>('/reports/missing-documents', query, signal),
    [tripId, delegateId],
  );
  return (
    <div className="stack">
      <div className="card">
        <div className="card-body">
          <div className="filters">
            <Field label="الرحلة">
              <SelectInput value={tripId} onChange={(event) => setTripId(event.target.value)}>
                <option value="">كل الرحلات</option>
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {tripLabel(trip)}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="المندوب">
              <SelectInput value={delegateId} onChange={(event) => setDelegateId(event.target.value)}>
                <option value="">كل المناديب</option>
                {delegates.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <ExportButtons path="/reports/missing-documents" query={query} />
          </div>
        </div>
      </div>
      <div className="card">
        {!data.data ? (
          <LoadState loading={data.loading} error={data.error} />
        ) : (
          <>
            <div className="card-header">
              <h3>
                {data.data.summary.incomplete > 0
                  ? `${formatCount(data.data.summary.incomplete)} ملف ناقص من ${formatCount(data.data.summary.total)} معتمر نشط`
                  : 'كل الملفات مكتملة'}
              </h3>
              <div className="row">
                <Badge tone="danger">ناقص صورة الجواز: {formatCount(data.data.summary.missingPassport)}</Badge>
                <Badge tone="warning">ناقص الصورة الشخصية: {formatCount(data.data.summary.missingPhoto)}</Badge>
              </div>
            </div>
            {data.data.rows.length === 0 ? (
              <EmptyState icon="check-circle" title="لا توجد مستندات ناقصة" description="كل المعتمرين النشطين ضمن هذا الاختيار ملفاتهم مكتملة" />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>م</th>
                      <th>الاسم</th>
                      <th>رقم جواز السفر</th>
                      <th>الرحلة</th>
                      <th>المندوب</th>
                      <th>المستندات الناقصة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.rows.map((row) => (
                      <tr key={`${row.passportNumber}-${row.index}`}>
                        <td className="mono">{row.index}</td>
                        <td>
                          <strong>{row.name}</strong>
                        </td>
                        <td className="mono">{row.passportNumber}</td>
                        <td>{row.tripName}</td>
                        <td>{row.delegateName}</td>
                        <td>
                          <div className="row">
                            {!row.hasPassportImage ? <Badge tone="danger">صورة جواز السفر</Badge> : null}
                            {!row.hasPersonalPhoto ? <Badge tone="warning">الصورة الشخصية</Badge> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const StatementReport = ({ delegates }: { delegates: DelegateOption[] }) => {
  const [delegateId, setDelegateId] = useState('');
  const summary = useAsync<DelegateAccount | null>(
    (signal) =>
      delegateId ? api.get<DelegateAccount>(`/finance/delegates/${delegateId}/balance`, undefined, signal) : Promise.resolve(null),
    [delegateId],
  );
  return (
    <div className="card">
      <div className="card-body stack">
        <div className="filters">
          <Field label="المندوب" required>
            <SelectInput value={delegateId} onChange={(event) => setDelegateId(event.target.value)}>
              <option value="">اختر المندوب</option>
              {delegates.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          {delegateId ? <ExportButtons path={`/reports/account-statement/${delegateId}`} query={{}} /> : null}
        </div>
        {!delegateId ? (
          <EmptyState icon="receipt" title="اختر مندوباً" description="لتحميل كشف حسابه بنفس أرقام صفحة الحساب" />
        ) : summary.data ? (
          <>
            <AccountSummaryList summary={summary.data} />
            <Link className="btn ghost sm" to={`/accounts/${delegateId}`}>
              فتح صفحة حساب المندوب
            </Link>
          </>
        ) : (
          <LoadState loading={summary.loading} error={summary.error} />
        )}
      </div>
    </div>
  );
};

const PaymentsReport = ({ delegates }: { delegates: DelegateOption[] }) => {
  const [delegateId, setDelegateId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = { delegateId: delegateId || undefined, from: from || undefined, to: to || undefined };
  const data = useAsync<PaymentReport>(
    (signal) => api.get<PaymentReport>('/reports/payments', query, signal),
    [delegateId, from, to],
  );
  return (
    <div className="stack">
      <div className="card">
        <div className="card-body">
          <div className="filters">
            <Field label="المندوب">
              <SelectInput value={delegateId} onChange={(event) => setDelegateId(event.target.value)}>
                <option value="">كل المناديب</option>
                {delegates.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
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
            <ExportButtons path="/reports/payments" query={query} />
          </div>
        </div>
      </div>
      <div className="card">
        {!data.data ? (
          <LoadState loading={data.loading} error={data.error} />
        ) : (
          <>
            <div className="card-header">
              <h3>{formatCount(data.data.summary.activeCount)} دفعة مسجلة</h3>
              <Badge tone="success">الإجمالي (بدون الملغاة): {formatAmount(data.data.summary.totalActive)} جنيه</Badge>
            </div>
            {data.data.rows.length === 0 ? (
              <EmptyState icon="wallet" title="لا توجد دفعات في هذه الفترة" />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>م</th>
                      <th>رقم الإيصال الورقي</th>
                      <th>المندوب</th>
                      <th className="num">المبلغ</th>
                      <th>طريقة الدفع</th>
                      <th>التاريخ</th>
                      <th>الحالة</th>
                      <th>سجّلها</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.rows.map((row) => (
                      <tr key={`${row.receiptNumber}-${row.index}`} className={row.status === 'VOIDED' ? 'row-voided' : undefined}>
                        <td className="mono">{row.index}</td>
                        <td className="mono">{row.receiptNumber || '—'}</td>
                        <td>{row.delegateName}</td>
                        <td className="num mono amount">{formatAmount(row.amount)}</td>
                        <td>{paymentMethodLabel[row.paymentMethod]}</td>
                        <td className="mono">{formatDate(row.paymentDate)}</td>
                        <td>
                          <Badge tone={row.status === 'ACTIVE' ? 'success' : 'danger'}>{paymentStatusLabel[row.status]}</Badge>
                        </td>
                        <td>{row.createdBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
