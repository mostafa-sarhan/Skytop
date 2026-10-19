/**
 * Live feedback for NEW usernames / passwords — mirrors
 * server/src/utils/credentials.ts (the server is the authority). Existing
 * short usernames and older passwords keep working until they are changed.
 */
export const USERNAME_MIN_LENGTH = 6;
export const PASSWORD_MIN_LENGTH = 10;

export const usernameProblem = (username: string): string | null => {
  const value = username.trim();
  if (value.length < USERNAME_MIN_LENGTH) return `اسم المستخدم يجب ألا يقل عن ${USERNAME_MIN_LENGTH} أحرف`;
  if (value.length > 40) return 'اسم المستخدم يجب ألا يزيد عن 40 حرفاً';
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) return 'اسم المستخدم يجب أن يتكون من حروف إنجليزية وأرقام فقط (ويُسمح بـ . _ -)';
  return null;
};

export interface PasswordRule {
  label: string;
  ok: boolean;
}

export const passwordRules = (password: string, username = ''): PasswordRule[] => [
  { label: `${PASSWORD_MIN_LENGTH} أحرف على الأقل`, ok: password.length >= PASSWORD_MIN_LENGTH },
  { label: 'حرف إنجليزي كبير (A-Z)', ok: /[A-Z]/.test(password) },
  { label: 'حرف إنجليزي صغير (a-z)', ok: /[a-z]/.test(password) },
  { label: 'رقم (\u20660-9\u2069)', ok: /[0-9]/.test(password) },
  { label: 'رمز خاص مثل @ # $ !', ok: /[^A-Za-z0-9]/.test(password) },
  ...(username.trim().length >= 3
    ? [{ label: 'لا تحتوي على اسم المستخدم', ok: !password.toLowerCase().includes(username.trim().toLowerCase()) }]
    : []),
];

export const passwordIsValid = (password: string, username = ''): boolean =>
  new TextEncoder().encode(password).length <= 72 && passwordRules(password, username).every((rule) => rule.ok);
