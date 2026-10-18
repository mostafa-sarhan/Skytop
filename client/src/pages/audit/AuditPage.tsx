import { useState } from 'react';
import { api } from '../../api/client';
import type { AuditLog, Paginated } from '../../api/types';
import { useAsync, useListState } from '../../lib/hooks';
import { auditActionLabel, formatDateTime, roleLabel } from '../../lib/format';
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
            <Field label="بحث بالكيان">
              <TextInput
                className="input-search"
                value={list.search}
                onChange={(event) => list.setSearch(event.target.value)}
                placeholder="رقم المعرّف أو الاسم"
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
                <table className="data">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>المستخدم</th>
                      <th>العملية</th>
                      <th>الكيان</th>
                      <th>التفاصيل</th>
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
                        <td>{log.entityType}</td>
                        <td className="mono small">{log.entityId ?? '—'}</td>
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
            <dt>الكيان</dt>
            <dd>{selected.entityType}</dd>
            <dt>المعرّف</dt>
            <dd className="mono">{selected.entityId ?? '—'}</dd>
            <dt>المستخدم</dt>
            <dd>
              {selected.user.fullName} ({selected.user.username})
            </dd>
            <dt>الوقت</dt>
            <dd className="mono">{formatDateTime(selected.createdAt)}</dd>
          </dl>
          <div className="grid cols-2">
            <div>
              <h3 style={{ marginBottom: 8 }}>البيانات السابقة</h3>
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
              <h3 style={{ marginBottom: 8 }}>البيانات الجديدة</h3>
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
