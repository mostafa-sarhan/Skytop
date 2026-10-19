import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, authErrorMessage } from '../auth/AuthContext';
import { BrandMark } from '../ui/BrandMark';
import { Alert, Field, Icon, TextInput } from '../ui/primitives';

const points = [
  'إدارة المندوبين والرحلات والمعتمرين',
  'تحصيل مالي وإيصالات وكشوف حساب',
  'تقارير تشغيلية ومالية قابلة للتصدير',
];

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="brand-head">
          <BrandMark size="lg" />
          <div>
            <div className="brand-name">سكاي توب</div>
            <div className="brand-sub">Sky Top Travel</div>
          </div>
        </div>

        <div>
          <h2>نظام إدارة الرحلات والمعتمرين</h2>
          <p className="lede">
            منصة عمل داخلية تجمع المندوبين والرحلات والمعتمرين والتحصيل المالي
            والتقارير في مكان واحد.
          </p>
          <div className="login-points">
            {points.map((point) => (
              <div className="login-point" key={point}>
                <span className="dot">
                  <Icon name="check" size={13} />
                </span>
                {point}
              </div>
            ))}
          </div>
        </div>

        <div className="brand-foot">نظام الإدارة الداخلية — للموظفين والإدارة فقط</div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <div className="mobile-brand">
            <BrandMark size="sm" />
            <div>
              <div className="brand-name">سكاي توب</div>
              <div className="brand-sub">نظام الإدارة الداخلية</div>
            </div>
          </div>

          <div className="brand">
            <h1>أهلاً بك</h1>
            <p>سجّل الدخول للمتابعة إلى لوحة التحكم</p>
          </div>

          <form onSubmit={(event) => void onSubmit(event)}>
            <div className="form-head">
              <h2>تسجيل الدخول</h2>
              <p>أدخل بيانات حسابك للوصول إلى النظام</p>
            </div>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <Field label="اسم المستخدم" required>
              <TextInput
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="username"
                dir="ltr"
              />
            </Field>

            <Field label="كلمة المرور" required>
              <div className="input-affix">
                <TextInput
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  dir="ltr"
                />
                <button
                  type="button"
                  className="icon-btn affix-btn"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  <Icon name="eye" size={17} />
                </button>
              </div>
            </Field>

            <button type="submit" className="btn block lg" disabled={submitting}>
              {submitting ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>

          <div className="foot-note">للدعم الفني تواصل مع مسؤول النظام</div>
          {/* English credit: an LTR block so the phrase keeps its word order inside the RTL page. */}
          <p className="dev-credit" dir="ltr" lang="en">
            Developed by{' '}
            <a href="https://mostafasarhan.tech" target="_blank" rel="noopener noreferrer">
              Mostafa Sarhan
              <span className="sr-only" lang="ar"> (يفتح في نافذة جديدة)</span>
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
