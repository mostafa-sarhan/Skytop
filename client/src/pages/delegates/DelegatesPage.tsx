import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { Delegate, DelegateStatus, Paginated } from '../../api/types';
import { useAsync, useListState, validationMessages } from '../../lib/hooks';
import { delegateStatusLabel } from '../../lib/format';
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
} from '../../ui/primitives';
import { useDebouncedValue } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

const emptyForm = { name: '', phone: '', address: '', notes: '' };

export const DelegateFormModal = ({
  delegate,
  onClose,
  onSaved,
}: {
  delegate?: Delegate | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const toast = useToast();
  const [form, setForm] = useState(
    delegate
      ? {
          name: delegate.name,
          phone: delegate.phone,
          address: delegate.address,
          notes: delegate.notes ?? '',
        }
      : emptyForm,
  );
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async () => {
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        notes: form.notes.trim() || undefined,
      };
      if (delegate) {
        await api.patch(`/delegates/${delegate.id}`, payload);
        toast.success('تم تحديث بيانات المندوب');
      } else {
        await api.post('/delegates', payload);
        toast.success('تمت إضافة المندوب');
      }
      onSaved();
      onClose();
    } catch (err) {
      setFieldErrors(validationMessages(err));
      setError(errorMessage(err, 'تعذر حفظ بيانات المندوب'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={delegate ? 'تعديل المندوب' : 'إضافة مندوب جديد'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void submit()}
            disabled={submitting || !form.name || !form.phone || !form.address}
          >
            {submitting ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <Field label="اسم المندوب" required error={fieldErrors.name}>
        <TextInput value={form.name} onChange={set('name')} />
      </Field>
      <Field label="رقم الهاتف" required error={fieldErrors.phone}>
        <TextInput value={form.phone} onChange={set('phone')} dir="ltr" placeholder="01xxxxxxxxx" />
      </Field>
      <Field label="العنوان" required error={fieldErrors.address}>
        <TextInput value={form.address} onChange={set('address')} />
      </Field>
      <Field label="ملاحظات" error={fieldErrors.notes}>
        <textarea className="textarea" value={form.notes} onChange={set('notes')} />
      </Field>
    </Modal>
  );
};

export const DelegatesPage = () => {
  const list = useListState();
  const toast = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'' | DelegateStatus>('');
  const [modalOpen, setModalOpen] = useState(false);
  const debouncedStatus = useDebouncedValue(status);

  const { data, loading, error, reload } = useAsync<Paginated<Delegate>>(
    (signal) =>
      api.get<Paginated<Delegate>>(
        '/delegates',
        {
          page: list.page,
          pageSize: list.pageSize,
          search: list.debouncedSearch || undefined,
          status: debouncedStatus || undefined,
        },
        signal,
      ),
    [list.page, list.pageSize, list.debouncedSearch, debouncedStatus],
  );

  const toggleStatus = async (delegate: Delegate) => {
    const next: DelegateStatus = delegate.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const label = next === 'ACTIVE' ? 'تفعيل' : 'إيقاف';
    if (!window.confirm(`${label} المندوب "${delegate.name}"؟`)) return;
    try {
      await api.post(`/delegates/${delegate.id}/status`, { status: next });
      toast.success(`تم ${label} المندوب`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="المناديب"
        subtitle="بيانات المناديب ورحلاتهم ومعتمريهم"
        actions={
          <button type="button" className="btn" onClick={() => setModalOpen(true)}>
            <Icon name="plus" size={15} /> إضافة مندوب
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
                placeholder="اسم المندوب أو رقم الهاتف"
              />
            </Field>
            <Field label="الحالة">
              <SelectInput
                value={status}
                onChange={(event) => setStatus(event.target.value as DelegateStatus | '')}
              >
                <option value="">الكل</option>
                <option value="ACTIVE">نشط</option>
                <option value="INACTIVE">موقوف</option>
              </SelectInput>
            </Field>
            <button type="button" className="btn secondary" onClick={reload}>
              <Icon name="refresh" size={15} /> تحديث
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <LoadingBlock /> : null}
        {error ? <EmptyState title="تعذر تحميل قائمة المناديب" /> : null}
        {data ? (
          data.items.length === 0 ? (
            <EmptyState
              title="لا يوجد مناديب"
              description="ابدأ بإضافة مندوب جديد"
              action={
                <button type="button" className="btn" onClick={() => setModalOpen(true)}>
                  إضافة مندوب
                </button>
              }
            />
          ) : (
            <>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>اسم المندوب</th>
                      <th>الهاتف</th>
                      <th>العنوان</th>
                      <th className="num">الرحلات النشطة</th>
                      <th>الحالة</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((delegate) => {
                      return (
                        <tr key={delegate.id}>
                          <td>
                            <Link to={`/delegates/${delegate.id}`}>
                              <strong>{delegate.name}</strong>
                            </Link>
                            {delegate.isSystem ? (
                              <>
                                {' '}
                                <Badge tone="info">نظامي</Badge>
                              </>
                            ) : null}
                          </td>
                          <td className="mono">{delegate.phone}</td>
                          <td className="muted">{delegate.address}</td>
                          <td className="num mono">{delegate.activeTripCount ?? 0}</td>
                          <td>
                            <Badge tone={delegate.status === 'ACTIVE' ? 'success' : 'warning'}>
                              {delegateStatusLabel[delegate.status]}
                            </Badge>
                          </td>
                          <td>
                            <div className="row">
                              <button
                                type="button"
                                className="btn ghost sm"
                                onClick={() => navigate(`/delegates/${delegate.id}`)}
                              >
                                <Icon name="eye" size={14} /> عرض
                              </button>
                              {!delegate.isSystem ? (
                                <>
                                  <Link className="btn ghost sm" to={`/delegates/${delegate.id}?edit=1`}>
                                    <Icon name="edit" size={14} /> تعديل
                                  </Link>
                                  <button
                                    type="button"
                                    className="btn ghost sm"
                                    onClick={() => void toggleStatus(delegate)}
                                  >
                                    {delegate.status === 'ACTIVE' ? 'إيقاف' : 'تفعيل'}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination {...data.meta} onPage={list.setPage} />
            </>
          )
        ) : null}
      </div>

      {modalOpen ? (
        <DelegateFormModal onClose={() => setModalOpen(false)} onSaved={reload} />
      ) : null}
    </div>
  );
};
