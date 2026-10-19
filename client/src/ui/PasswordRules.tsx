import { passwordRules } from '../lib/credentials';
import { Icon } from './primitives';

/** Live checklist of the password policy under a new-password field. */
export const PasswordRules = ({ password, username }: { password: string; username?: string }) => (
  <ul className="password-rules" aria-label="شروط كلمة المرور">
    {passwordRules(password, username).map((rule) => (
      <li key={rule.label} className={rule.ok ? 'is-ok' : undefined}>
        <Icon name={rule.ok ? 'check-circle' : 'alert'} size={13} />
        <span>{rule.label}</span>
        <span className="sr-only">{rule.ok ? ' — متحقق' : ' — غير متحقق'}</span>
      </li>
    ))}
  </ul>
);
