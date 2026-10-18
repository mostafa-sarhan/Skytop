import { useState } from 'react';
import { api } from '../../api/client';
import type { AuditLog, Paginated } from '../../api/types';
import { useAsync, useListState } from '../../lib/hooks';
import { auditActionLabel, auditEntityLabel, formatDateTime, roleLabel } from '../../lib/format';
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  SelectInput,
  TextInput,
  useDebouncedValue,
} from '../../ui/primitives';

export const AuditPage = () => {
  const list = useListState();
  const [action, setAction] = useState('');
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const debouncedAction = useDebouncedValue(action);

  const actions = useAsync<{ actions: string[] }>(
    (signal) => api.get<{ actions: string[] }>('/audit/actions', undefined, signal),
    [],
  );

  const { data, loading, error, reload } = useAsync<Paginated<AuditLog>>(
    (signal) =>
      api.get<Paginated<AuditLog>>(
        '/audit',
        {
          page: list.page,
          pageSize: list.pageSize,
          search: list.debouncedSearch || undefined,
          action: debouncedAction || undefined,
        },
        signal,
      ),
    [list.page, list.pageSize, list.debouncedSearch, debouncedAction],
  );

  return (
    <div className="page">
      <PageHeader
        title="سجل التدقيق"
        subtitle="كل العمليات الحساسة مسجلة باسم المستخدم والوقت"
        actions={
          <button type="button" className="btn secondary" onClick={reload}>
            <Icon name="refresh" size={15} /> تحديث
          </button>
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
                placeholder="اسم، رقم إيصال، سبب..."
                latinDigits
              />
            </Field>
            <Field label="نوع العملية">
              <SelectInput value={action} onChange={(event) => setAction(event.target.value)}>
                <option value="">الكل</option>
                {(actions.data?.actions ?? []).map((item) => (
                  <option key={item} value={item}>
                    {auditActionLabel[item] ?? item}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <LoadingBlock /> : null}
        {error ? <EmptyState title="تعذر تحميل سجل التدقيق" /> : null}
        {data ? (
          data.items.length === 0 ? (
            <EmptyState title="لا توجد سجلات" />
          ) : (
            <>
              <div className="table-wrap">
                <table className="data stack-on-phone stack-on-tablet">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>المستخدم</th>
                      <th>العملية</th>
                      <th>النوع</th>
                      <th>المرجع</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((log) => (
                      <tr key={log.id}>
                        <td className="mono">{formatDateTime(log.createdAt)}</td>
                        <td>
                          <strong>{log.user.fullName}</strong>
                          <div className="muted small">{roleLabel[log.user.role]}</div>
                        </td>
                        <td>
                          <Badge tone="primary">{auditActionLabel[log.action] ?? log.action}</Badge>
                        </td>
                        <td>{auditEntityLabel[log.entityType] ?? 'سجل'}</td>
                        <td className="wrap">
                          {log.reference ? (
                            <>
                              <strong>{log.reference.title}</strong>
                              {log.reference.subtitle ? <div className="muted small">{log.reference.subtitle}</div> : null}
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <button type="button" className="btn ghost sm" onClick={() => setSelected(log)}>
                            <Icon name="eye" size={14} /> عرض
                          </button>
                        </td>
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

      {selected ? (
        <Modal title="تفاصيل العملية" onClose={() => setSelected(null)} size="wide">
          <dl className="kv">
            <dt>العملية</dt>
            <dd>{auditActionLabel[selected.action] ?? selected.action}</dd>
            <dt>النوع</dt>
            <dd>{auditEntityLabel[selected.entityType] ?? 'سجل'}</dd>
            <dt>المرجع</dt>
            <dd>
              {selected.reference?.title ?? '—'}
              {selected.reference?.subtitle ? <div className="muted small">{selected.reference.subtitle}</div> : null}
            </dd>
            <dt>المستخدم</dt>
            <dd>
              {selected.user.fullName} ({selected.user.username})
            </dd>
            <dt>الوقت</dt>
            <dd className="mono">{formatDateTime(selected.createdAt)}</dd>
          </dl>
          <h3 style={{ margin: '16px 0 4px' }}>البيانات الفنية</h3>
          <p className="muted small" style={{ marginTop: 0 }}>
            القيم كما سُجّلت في النظام وقت العملية — المعرّف الفني:{' '}
            <span className="mono" dir="ltr">
              {selected.entityId ?? '—'}
            </span>
          </p>
          <div className="grid cols-2">
            <div>
              <h3 style={{ marginBottom: 8 }}>قبل العملية</h3>
              <pre
                className="mono small"
                style={{
                  background: 'var(--surface-2)',
                  padding: 12,
                  borderRadius: 8,
                  overflowX: 'auto',
                  direction: 'ltr',
                  textAlign: 'start',
                }}
              >
                {selected.oldData ? JSON.stringify(selected.oldData, null, 2) : '—'}
              </pre>
            </div>
            <div>
              <h3 style={{ marginBottom: 8 }}>بعد العملية</h3>
              <pre
                className="mono small"
                style={{
                  background: 'var(--surface-2)',
                  padding: 12,
                  borderRadius: 8,
                  overflowX: 'auto',
                  direction: 'ltr',
                  textAlign: 'start',
                }}
              >
                {selected.newData ? JSON.stringify(selected.newData, null, 2) : '—'}
              </pre>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
};
