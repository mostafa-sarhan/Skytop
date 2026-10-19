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
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { PasswordRules } from '../../ui/PasswordRules';
import { USERNAME_MIN_LENGTH, passwordIsValid, usernameProblem } from '../../lib/credentials';

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
  // A NEW username must follow the policy; an unchanged legacy one is kept.
  const unchanged = Boolean(user) && username.trim().toLowerCase() === user?.username;
  const usernameError = unchanged ? null : usernameProblem(username);
  const legacyShort = Boolean(user) && (user?.username.length ?? 0) < USERNAME_MIN_LENGTH;

  const submit = async () => {
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      if (user) {
        const rename = username.trim().toLowerCase() !== user.username ? { username: username.trim() } : {};
        await api.patch(`/users/${user.id}`, { fullName, role, isActive, ...rename });
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
      dismissible={!submitting}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void submit()}
            disabled={submitting || !fullName || Boolean(usernameError) || (!user && !passwordIsValid(password, username))}
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
      <Field
        label="اسم المستخدم (للدخول)"
        required
        error={fieldErrors.username ?? (username && usernameError ? usernameError : undefined)}
        hint={
          user
            ? legacyShort
              ? 'اسم قديم أقل من 6 أحرف — ما زال يعمل، ويمكن تغييره هنا إلى اسم أطول'
              : 'تغيير الاسم يغيّر بيانات الدخول لهذا المستخدم'
            : '6 أحرف على الأقل، حروف إنجليزية وأرقام'
        }
      >
        <TextInput
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          dir="ltr"
          autoComplete="off"
          invalid={Boolean(fieldErrors.username || (username && usernameError))}
        />
      </Field>
      {!user ? (
        <Field label="كلمة المرور" required error={fieldErrors.password}>
          <TextInput
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            dir="ltr"
            autoComplete="new-password"
          />
          <PasswordRules password={password} username={username} />
        </Field>
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
  const [fieldError, setFieldError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    setFieldError('');
    try {
      await api.post(`/users/${user.id}/reset-password`, { newPassword: password });
      toast.success('تم إعادة تعيين كلمة المرور');
      onClose();
    } catch (err) {
      setFieldError(validationMessages(err).newPassword ?? '');
      setError(errorMessage(err, 'تعذر إعادة التعيين'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`إعادة تعيين كلمة مرور — ${user.username}`}
      onClose={onClose}
      dismissible={!submitting}
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
            disabled={submitting || !passwordIsValid(password, user.username)}
          >
            {submitting ? 'جارٍ التنفيذ...' : 'إعادة التعيين'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <Field label="كلمة المرور الجديدة" required error={fieldError || undefined}>
        <TextInput
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          dir="ltr"
          autoComplete="new-password"
        />
        <PasswordRules password={password} username={user.username} />
      </Field>
      <p className="muted small" style={{ margin: 0 }}>
        تنتهي جلسات هذا المستخدم المفتوحة فوراً، وسيُطلب منه تغيير كلمة المرور عند الدخول.
      </p>
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

  const [statusUser, setStatusUser] = useState<User | null>(null);

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
                    <td>
                      <span className="mono-inline">{user.username}</span>
                      {user.username.length < USERNAME_MIN_LENGTH ? (
                        <div className="muted small" title="اسم دخول قديم: يعمل كما هو، ويمكن تغييره من «تعديل»">
                          أقل من {USERNAME_MIN_LENGTH} أحرف
                        </div>
                      ) : null}
                    </td>
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
                            onClick={() => setStatusUser(user)}
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
      {statusUser ? (
        <ConfirmDialog
          title={statusUser.isActive ? 'إيقاف الحساب' : 'تفعيل الحساب'}
          confirmLabel={statusUser.isActive ? 'إيقاف الحساب' : 'تفعيل الحساب'}
          tone={statusUser.isActive ? 'danger' : 'primary'}
          onClose={() => setStatusUser(null)}
          onConfirm={async () => {
            await api.patch(`/users/${statusUser.id}`, { isActive: !statusUser.isActive });
            toast.success(statusUser.isActive ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب');
            reload();
          }}
        >
          {statusUser.isActive ? (
            <p>
              سيتم إيقاف حساب <strong>«{statusUser.fullName}»</strong> (<span className="mono-inline">{statusUser.username}</span>).
              لن يتمكن من تسجيل الدخول، وتنتهي جلساته المفتوحة فوراً. يمكن إعادة تفعيله لاحقاً.
            </p>
          ) : (
            <p>
              سيتم تفعيل حساب <strong>«{statusUser.fullName}»</strong> (<span className="mono-inline">{statusUser.username}</span>)
              ليتمكن من تسجيل الدخول من جديد.
            </p>
          )}
        </ConfirmDialog>
      ) : null}
    </div>
  );
};
