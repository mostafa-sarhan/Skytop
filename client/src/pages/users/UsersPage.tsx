import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Paginated, Role, User } from '../../api/types';
import { useAsync, useListState, validationMessages } from '../../lib/hooks';
import { formatDateTime, roleLabel } from '../../lib/format';
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
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../ui/Toast';

const UserModal = ({
  user,
  onClose,
  onSaved,
}: {
  user?: User | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const toast = useToast();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? 'EMPLOYEE');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      if (user) {
        await api.patch(`/users/${user.id}`, { fullName, role, isActive });
        toast.success('تم تحديث الحساب');
      } else {
        await api.post('/users', { fullName, username, password, role });
        toast.success('تم إنشاء الحساب');
      }
      onSaved();
      onClose();
    } catch (err) {
      setFieldErrors(validationMessages(err));
      setError(errorMessage(err, 'تعذر حفظ الحساب'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={user ? `تعديل الحساب — ${user.username}` : 'إضافة مستخدم جديد'}
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
            disabled={submitting || !fullName || (!user && (!username || password.length < 8))}
          >
            {submitting ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <Field label="الاسم الكامل" required error={fieldErrors.fullName}>
        <TextInput value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </Field>
      {!user ? (
        <div className="form-grid">
          <Field label="اسم المستخدم" required error={fieldErrors.username} hint="حروف إنجليزية وأرقام">
            <TextInput
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              dir="ltr"
            />
          </Field>
          <Field label="كلمة المرور" required error={fieldErrors.password} hint="8 أحرف على الأقل">
            <TextInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              dir="ltr"
            />
          </Field>
        </div>
      ) : null}
      <div className="form-grid">
        <Field label="الصلاحية" required error={fieldErrors.role}>
          <SelectInput value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="EMPLOYEE">{roleLabel.EMPLOYEE}</option>
            <option value="MANAGER">{roleLabel.MANAGER}</option>
          </SelectInput>
        </Field>
        {user ? (
          <Field label="الحالة">
            <SelectInput
              value={isActive ? '1' : '0'}
              onChange={(event) => setIsActive(event.target.value === '1')}
            >
              <option value="1">نشط</option>
              <option value="0">موقوف</option>
            </SelectInput>
          </Field>
        ) : null}
      </div>
      {user ? (
        <p className="muted small" style={{ margin: 0 }}>
          سيتم إجبار المستخدم على تغيير كلمة المرور بعد إعادة تعيينها.
        </p>
      ) : null}
    </Modal>
  );
};

const ResetPasswordModal = ({ user, onClose }: { user: User; onClose: () => void }) => {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/users/${user.id}/reset-password`, { newPassword: password });
      toast.success('تم إعادة تعيين كلمة المرور');
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'تعذر إعادة التعيين'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`إعادة تعيين كلمة مرور — ${user.username}`}
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void submit()}
            disabled={submitting || password.length < 8}
          >
            {submitting ? 'جارٍ التنفيذ...' : 'إعادة التعيين'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <Field label="كلمة المرور الجديدة" required hint="8 أحرف على الأقل">
        <TextInput
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          dir="ltr"
        />
      </Field>
    </Modal>
  );
};

export const UsersPage = () => {
  const list = useListState();
  const toast = useToast();
  const { user: me } = useAuth();
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');
  const [modalUser, setModalUser] = useState<User | null | undefined>(undefined);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const debouncedRole = useDebouncedValue(roleFilter);

  const { data, loading, error, reload } = useAsync<Paginated<User>>(
    (signal) =>
      api.get<Paginated<User>>(
        '/users',
        {
          page: list.page,
          pageSize: list.pageSize,
          search: list.debouncedSearch || undefined,
          role: debouncedRole || undefined,
        },
        signal,
      ),
    [list.page, list.pageSize, list.debouncedSearch, debouncedRole],
  );

  const toggleActive = async (user: User) => {
    try {
      await api.patch(`/users/${user.id}`, { isActive: !user.isActive });
      toast.success(user.isActive ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="المستخدمون"
        subtitle="إدارة حسابات الموظفين ومديري النظام"
        actions={
          <button type="button" className="btn" onClick={() => setModalUser(null)}>
            <Icon name="plus" size={15} /> إضافة مستخدم
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
                placeholder="الاسم أو اسم المستخدم"
              />
            </Field>
            <Field label="الصلاحية">
              <SelectInput
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as Role | '')}
              >
                <option value="">الكل</option>
                <option value="EMPLOYEE">{roleLabel.EMPLOYEE}</option>
                <option value="MANAGER">{roleLabel.MANAGER}</option>
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
        {error ? <EmptyState title="تعذر تحميل المستخدمين" /> : null}
        {data ? (
          <div className="table-wrap">
            <table className="data stack-on-phone stack-on-tablet">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>اسم المستخدم</th>
                  <th>الصلاحية</th>
                  <th>الحالة</th>
                  <th>آخر دخول</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr key={user.id}>
                    <td className="primary-cell">
                      <strong>{user.fullName}</strong>
                      {me?.id === user.id ? <Badge tone="primary">أنت</Badge> : null}
                    </td>
                    <td className="mono">{user.username}</td>
                    <td>
                      <Badge tone={user.role === 'MANAGER' ? 'info' : 'default'}>
                        {roleLabel[user.role]}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={user.isActive ? 'success' : 'danger'}>
                        {user.isActive ? 'نشط' : 'موقوف'}
                      </Badge>
                    </td>
                    <td className="mono">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}</td>
                    <td>
                      <div className="row">
                        <button type="button" className="btn ghost sm" onClick={() => setModalUser(user)}>
                          <Icon name="edit" size={14} /> تعديل
                        </button>
                        <button type="button" className="btn ghost sm" onClick={() => setResetUser(user)}>
                          كلمة مرور
                        </button>
                        {me?.id !== user.id ? (
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => void toggleActive(user)}
                          >
                            {user.isActive ? 'إيقاف' : 'تفعيل'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {data ? <Pagination {...data.meta} onPage={list.setPage} /> : null}
      </div>

      {modalUser !== undefined ? (
        <UserModal user={modalUser} onClose={() => setModalUser(undefined)} onSaved={reload} />
      ) : null}
      {resetUser ? <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} /> : null}
    </div>
  );
};
