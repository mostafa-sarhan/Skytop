import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ChangePasswordModal } from '../components/guards';
import { formatDateTime, initialsOf, roleLabel } from '../lib/format';
import { Badge, Icon, PageHeader } from '../ui/primitives';

export const ProfilePage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [changing, setChanging] = useState(false);

  if (!user) return null;

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="page">
      <PageHeader
        title="الحساب الشخصي"
        subtitle="بيانات حسابك وإدارة كلمة المرور"
        actions={
          <>
            <button type="button" className="btn secondary" onClick={() => setChanging(true)}>
              <Icon name="settings" size={15} /> تغيير كلمة المرور
            </button>
            <button type="button" className="btn danger" onClick={() => void signOut()}>
              تسجيل الخروج
            </button>
          </>
        }
      />

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="identity">
          <span className="avatar lg">{initialsOf(user.fullName)}</span>
          <div>
            <div className="identity-name">{user.fullName}</div>
            <div className="identity-meta">
              <Badge tone={user.role === 'MANAGER' ? 'info' : 'primary'}>{roleLabel[user.role]}</Badge>
              <span className="muted small mono">{user.username}</span>
            </div>
          </div>
        </div>
        <div className="card-body">
          <dl className="kv">
            <dt>حالة الحساب</dt>
            <dd>
              <Badge tone={user.isActive ? 'success' : 'danger'}>
                {user.isActive ? 'نشط' : 'موقوف'}
              </Badge>
            </dd>
            <dt>آخر دخول</dt>
            <dd className="mono">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}</dd>
          </dl>

          {user.mustChangePassword ? (
            <div className="alert warning mt-4">
              <div>
                <strong>كلمة المرور الافتراضية ما زالت مستخدمة</strong>
                يُرجى تغيير كلمة المرور قبل متابعة العمل.
              </div>
              <button type="button" className="btn sm" onClick={() => setChanging(true)}>
                تغيير كلمة المرور
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {changing ? <ChangePasswordModal onClose={() => setChanging(false)} /> : null}
    </div>
  );
};
