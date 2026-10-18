import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LoadingBlock, Modal, Field, TextInput } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import { errorMessage } from '../api/client';

export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading)
    return (
      <div className="screen-loading">
        <LoadingBlock label="جارٍ التحقق من الجلسة..." />
      </div>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
};

export const RequireManager = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="screen-loading">
        <LoadingBlock label="جارٍ التحقق من الصلاحيات..." />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'MANAGER') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

export const ChangePasswordModal = ({ onClose }: { onClose: () => void }) => {
  const { changePassword } = useAuth();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setError('');
  }, [currentPassword, newPassword, confirm]);

  const submit = async () => {
    if (newPassword !== confirm) {
      setError('تأكيد كلمة المرور غير مطابق');
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success('تم تغيير كلمة المرور بنجاح');
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'تعذر تغيير كلمة المرور'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="تغيير كلمة المرور"
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
            disabled={submitting || !currentPassword || !newPassword}
          >
            {submitting ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <Field label="كلمة المرور الحالية" required>
        <TextInput
          type="password"
          dir="ltr"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
        />
      </Field>
      <Field label="كلمة المرور الجديدة" required hint="8 أحرف على الأقل">
        <TextInput
          type="password"
          dir="ltr"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <Field label="تأكيد كلمة المرور الجديدة" required>
        <TextInput
          type="password"
          dir="ltr"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
        />
      </Field>
    </Modal>
  );
};
