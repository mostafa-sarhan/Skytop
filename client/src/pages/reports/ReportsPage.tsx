import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, download } from '../../api/client';
import type {
  Delegate,
  DelegatePilgrimsReport,
  MissingDocumentsReport,
  Paginated,
  PaymentReport,
  Trip,
  TripPilgrimsReport,
} from '../../api/types';
import { useAsync } from '../../lib/hooks';
import {
  documentStatusLabel,
  formatDate,
  formatAmount,
  paymentStatusLabel,
} from '../../lib/format';
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  LoadingBlock,
  PageHeader,
  SelectInput,
  Tabs,
  TextInput,
} from '../../ui/primitives';

type Tab = 'trip' | 'delegate' | 'missing' | 'payments';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'trip', label: 'معتمرو الرحلة' },
  { id: 'delegate', label: 'معتمرو المندوب' },
  { id: 'missing', label: 'الوثائق الناقصة' },
  { id: 'payments', label: 'سجل الدفعات' },
];

const ExportButtons = ({ onExcel, onPdf }: { onExcel: () => void; onPdf: () => void }) => (
  <div className="row">
    <button type="button" className="btn secondary sm" onClick={onExcel}>
      <Icon name="download" size={14} /> Excel
    </button>
    <button type="button" className="btn secondary sm" onClick={onPdf}>
      <Icon name="download" size={14} /> PDF
    </button>
  </div>
);

const docTone = (status: string) => (status === 'COMPLETE' ? 'success' : 'warning');

export const ReportsPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'trip';
  const [tripId, setTripId] = useState('');
  const [delegateId, setDelegateId] = useState('');
  const [missingTripId, setMissingTripId] = useState('');
  const [missingDelegateId, setMissingDelegateId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const setTab = (next: Tab) => {
    const search = new URLSearchParams(params);
    search.set('tab', next);
    setParams(search, { replace: true });
  };

  const trips = useAsync<Paginated<Trip>>(
    (signal) => api.get<Paginated<Trip>>('/trips', { pageSize: 200 }, signal),
    [],
  );
  const delegates = useAsync<Paginated<Delegate>>(
    (signal) => api.get<Paginated<Delegate>>('/delegates', { pageSize: 200 }, signal),
    [],
  );

  const tripReport = useAsync<TripPilgrimsReport | null>(
    (signal) =>
      tripId
        ? api.get<TripPilgrimsReport>('/reports/trip-pilgrims', { tripId }, signal)
        : Promise.resolve(null),
    [tripId],
  );

  const delegateReport = useAsync<DelegatePilgrimsReport | null>(
    (signal) =>
      delegateId
        ? api.get<DelegatePilgrimsReport>('/reports/delegate-pilgrims', { delegateId }, signal)
        : Promise.resolve(null),
    [delegateId],
  );

  const missingReport = useAsync<MissingDocumentsReport | null>(
    (signal) =>
      missingTripId || missingDelegateId
        ? api.get<MissingDocumentsReport>('/reports/missing-documents', {
            tripId: missingTripId || undefined,
            delegateId: missingDelegateId || undefined,
          }, signal)
        : Promise.resolve(null),
    [missingTripId, missingDelegateId],
  );

  const paymentReport = useAsync<PaymentReport | null>(
    (signal) =>
      from || to || delegateId
        ? api.get<PaymentReport>('/reports/payments', {
            delegateId: delegateId || undefined,
            from: from || undefined,
            to: to || undefined,
          }, signal)
        : Promise.resolve(null),
    [delegateId, from, to],
  );

  const tripOptions = trips.data?.items ?? [];
  const delegateOptions = delegates.data?.items ?? [];

  return (
    <div className="page">
      <PageHeader title="التقارير" subtitle="تقارير تشغيلية ومالية قابلة للتصدير إلى Excel و PDF" />

      <Tabs items={tabs} active={tab} onChange={(id) => setTab(id as Tab)} />

      {tab === 'trip' ? (
        <div className="stack">
          <div className="card">
            <div className="card-body">
              <div className="filters">
                <Field label="الرحلة" required>
                  <SelectInput value={tripId} onChange={(event) => setTripId(event.target.value)}>
                    <option value="">اختر الرحلة</option>
                    {tripOptions.map((trip) => (
                      <option key={trip.id} value={trip.id}>
                        {trip.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                {tripId ? (
                  <ExportButtons
                    onExcel={() => download('/reports/trip-pilgrims/excel', { tripId })}
                    onPdf={() => download('/reports/trip-pilgrims/pdf', { tripId })}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="card">
            {!tripId ? (
              <EmptyState title="اختر رحلة" description="لعرض قائمة معتمري الرحلة وتصديرها" />
            ) : tripReport.loading ? (
              <LoadingBlock />
            ) : tripReport.error || !tripReport.data ? (
              <EmptyState title="تعذر تحميل التقرير" />
            ) : (
              <>
                <div className="card-header">
                  <div>
                    <h3>{tripReport.data.meta.title}</h3>
                    <div className="muted small">{tripReport.data.trip.name}</div>
                  </div>
                  <div className="row">
                    <Badge tone="primary">إجمالي: {tripReport.data.summary.total}</Badge>
                    <Badge tone="success">مكتملة: {tripReport.data.summary.completeDocuments}</Badge>
                    <Badge tone="warning">ناقصة: {tripReport.data.summary.incompleteDocuments}</Badge>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>م</th>
                        <th>الاسم</th>
                        <th>الجواز</th>
                        <th>الهوية</th>
                        <th>الميلاد</th>
                        <th>المهنة</th>
                        <th>المندوب</th>
                        <th>الوثائق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tripReport.data.rows.map((row) => (
                        <tr key={`${row.passportNumber}-${row.index}`}>
                          <td className="mono">{row.index}</td>
                          <td>
                            <strong>{row.name}</strong>
                          </td>
                          <td className="mono">{row.passportNumber}</td>
                          <td className="mono">{row.nationalId || '—'}</td>
                          <td className="mono">{row.birthDate || '—'}</td>
                          <td>{row.job || '—'}</td>
                          <td>{row.delegateName}</td>
                          <td>
                            <Badge tone={docTone(row.documentStatus)}>
                              {documentStatusLabel[row.documentStatus]}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'delegate' ? (
        <div className="stack">
          <div className="card">
            <div className="card-body">
              <div className="filters">
                <Field label="المندوب" required>
                  <SelectInput
                    value={delegateId}
                    onChange={(event) => setDelegateId(event.target.value)}
                  >
                    <option value="">اختر المندوب</option>
                    {delegateOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                {delegateId ? (
                  <ExportButtons
                    onExcel={() => download('/reports/delegate-pilgrims/excel', { delegateId })}
                    onPdf={() => download('/reports/delegate-pilgrims/pdf', { delegateId })}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="card">
            {!delegateId ? (
              <EmptyState title="اختر مندوباً" description="لعرض قائمة معتمريه وتصديرها" />
            ) : delegateReport.loading ? (
              <LoadingBlock />
            ) : delegateReport.error || !delegateReport.data ? (
              <EmptyState title="تعذر تحميل التقرير" />
            ) : (
              <>
                <div className="card-header">
                  <div>
                    <h3>{delegateReport.data.meta.title}</h3>
                    <div className="muted small">{delegateReport.data.delegate.name}</div>
                  </div>
                  <div className="row">
                    <Badge tone="primary">إجمالي: {delegateReport.data.summary.total}</Badge>
                    <Badge tone="info">
                      إجمالي المطلوب عن الرحلات: {formatAmount(delegateReport.data.summary.tripsRequired)}
                    </Badge>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>م</th>
                        <th>الاسم</th>
                        <th>الجواز</th>
                        <th>الهوية</th>
                        <th>الرحلة</th>
                        <th>الوثائق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delegateReport.data.rows.map((row) => (
                        <tr key={`${row.passportNumber}-${row.index}`}>
                          <td className="mono">{row.index}</td>
                          <td>
                            <strong>{row.name}</strong>
                          </td>
                          <td className="mono">{row.passportNumber}</td>
                          <td className="mono">{row.nationalId || '—'}</td>
                          <td>{row.tripName}</td>
                          <td>
                            <Badge tone={docTone(row.documentStatus)}>
                              {documentStatusLabel[row.documentStatus]}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'missing' ? (
        <div className="stack">
          <div className="card">
            <div className="card-body">
              <div className="filters">
                <Field label="الرحلة">
                  <SelectInput
                    value={missingTripId}
                    onChange={(event) => setMissingTripId(event.target.value)}
                  >
                    <option value="">كل الرحلات</option>
                    {tripOptions.map((trip) => (
                      <option key={trip.id} value={trip.id}>
                        {trip.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="المندوب">
                  <SelectInput
                    value={missingDelegateId}
                    onChange={(event) => setMissingDelegateId(event.target.value)}
                  >
                    <option value="">كل المندوبين</option>
                    {delegateOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                {missingTripId || missingDelegateId ? (
                  <ExportButtons
                    onExcel={() =>
                      download('/reports/missing-documents/excel', {
                        tripId: missingTripId || undefined,
                        delegateId: missingDelegateId || undefined,
                      })
                    }
                    onPdf={() =>
                      download('/reports/missing-documents/pdf', {
                        tripId: missingTripId || undefined,
                        delegateId: missingDelegateId || undefined,
                      })
                    }
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="card">
            {!missingTripId && !missingDelegateId ? (
              <EmptyState title="حدد عوامل التصفية" description="اختر رحلة أو مندوباً لعرض الوثائق الناقصة" />
            ) : missingReport.loading ? (
              <LoadingBlock />
            ) : missingReport.error || !missingReport.data ? (
              <EmptyState title="تعذر تحميل التقرير" />
            ) : missingReport.data.rows.length === 0 ? (
              <EmptyState title="لا توجد وثائق ناقصة" description="جميع الوثائق مكتملة ضمن هذا التصنيف" />
            ) : (
              <>
                <div className="card-header">
                  <h3>{missingReport.data.meta.title}</h3>
                  <div className="row">
                    <Badge tone="warning">ناقصة: {missingReport.data.summary.incomplete}</Badge>
                    <Badge tone="danger">جواز: {missingReport.data.summary.missingPassport}</Badge>
                    <Badge tone="danger">صورة: {missingReport.data.summary.missingPhoto}</Badge>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>الاسم</th>
                        <th>الجواز</th>
                        <th>الرحلة</th>
                        <th>المندوب</th>
                        <th>صورة الجواز</th>
                        <th>الصورة الشخصية</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missingReport.data.rows.map((row, index) => (
                        <tr key={`${row.passportNumber}-${index}`}>
                          <td>
                            <strong>{row.name}</strong>
                          </td>
                          <td className="mono">{row.passportNumber}</td>
                          <td>{row.tripName}</td>
                          <td>{row.delegateName}</td>
                          <td>
                            <Badge tone={row.hasPassportImage ? 'success' : 'danger'}>
                              {row.hasPassportImage ? 'موجودة' : 'ناقصة'}
                            </Badge>
                          </td>
                          <td>
                            <Badge tone={row.hasPersonalPhoto ? 'success' : 'danger'}>
                              {row.hasPersonalPhoto ? 'موجودة' : 'ناقصة'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'payments' ? (
        <div className="stack">
          <div className="card">
            <div className="card-body">
              <div className="filters">
                <Field label="المندوب">
                  <SelectInput
                    value={delegateId}
                    onChange={(event) => setDelegateId(event.target.value)}
                  >
                    <option value="">كل المندوبين</option>
                    {delegateOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
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
                {delegateId || from || to ? (
                  <ExportButtons
                    onExcel={() =>
                      download('/reports/payments/excel', {
                        delegateId: delegateId || undefined,
                        from: from || undefined,
                        to: to || undefined,
                      })
                    }
                    onPdf={() =>
                      download('/reports/payments/pdf', {
                        delegateId: delegateId || undefined,
                        from: from || undefined,
                        to: to || undefined,
                      })
                    }
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="card">
            {!delegateId && !from && !to ? (
              <EmptyState title="حدد عوامل التصفية" description="اختر مندوباً أو فترة زمنية لعرض سجل الدفعات" />
            ) : paymentReport.loading ? (
              <LoadingBlock />
            ) : paymentReport.error || !paymentReport.data ? (
              <EmptyState title="تعذر تحميل التقرير" />
            ) : (
              <>
                <div className="card-header">
                  <h3>{paymentReport.data.meta.title}</h3>
                  <div className="row">
                    <Badge tone="primary">عدد: {paymentReport.data.summary.count}</Badge>
                    <Badge tone="success">
                      إجمالي الساري: {formatAmount(paymentReport.data.summary.totalActive)}
                    </Badge>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>م</th>
                        <th>رقم الإيصال الورقي</th>
                        <th>المندوب</th>
                        <th className="num">المبلغ</th>
                        <th>التاريخ</th>
                        <th>الحالة</th>
                        <th>الموظف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentReport.data.rows.map((row) => (
                        <tr key={`${row.receiptNumber}-${row.index}`}>
                          <td className="mono">{row.index}</td>
                          <td className="mono">{row.receiptNumber || '—'}</td>
                          <td>{row.delegateName}</td>
                          <td className="num mono">{formatAmount(row.amount)}</td>
                          <td className="mono">{formatDate(row.paymentDate)}</td>
                          <td>
                            <Badge tone={row.status === 'ACTIVE' ? 'success' : 'danger'}>
                              {paymentStatusLabel[row.status]}
                            </Badge>
                          </td>
                          <td>{row.createdBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
