/**
 * Credential policy for NEW usernames and NEW passwords (user creation,
 * password reset, password change, first-manager bootstrap). Existing
 * accounts are not affected until their username / password is changed:
 * short legacy usernames still log in and old password hashes keep working.
 * Mirrored for live feedback in client/src/lib/credentials.ts — the server is
 * the authority.
 */

export const USERNAME_MIN_LENGTH = 6;
export const USERNAME_MAX_LENGTH = 40;
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt only uses the first 72 bytes; longer input would be silently cut. */
export const PASSWORD_MAX_BYTES = 72;

export const usernameProblems = (username: string): string[] => {
  const problems: string[] = [];
  if (username.length < USERNAME_MIN_LENGTH) problems.push(`اسم المستخدم يجب ألا يقل عن ${USERNAME_MIN_LENGTH} أحرف`);
  if (username.length > USERNAME_MAX_LENGTH) problems.push(`اسم المستخدم يجب ألا يزيد عن ${USERNAME_MAX_LENGTH} حرفاً`);
  if (!USERNAME_PATTERN.test(username)) {
    problems.push('اسم المستخدم يجب أن يتكون من حروف إنجليزية وأرقام فقط (ويُسمح بـ . _ -)');
  }
  return problems;
};

export const passwordProblems = (password: string, username?: string): string[] => {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`كلمة المرور يجب ألا تقل عن ${PASSWORD_MIN_LENGTH} أحرف`);
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) problems.push('كلمة المرور طويلة جداً');
  if (!/[A-Z]/.test(password)) problems.push('كلمة المرور يجب أن تحتوي على حرف إنجليزي كبير (A-Z)');
  if (!/[a-z]/.test(password)) problems.push('كلمة المرور يجب أن تحتوي على حرف إنجليزي صغير (a-z)');
  // U+2066/U+2069 keep "0-9" left-to-right inside Arabic text (else shown as 9-0).
  if (!/[0-9]/.test(password)) problems.push('كلمة المرور يجب أن تحتوي على رقم (\u20660-9\u2069)');
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('كلمة المرور يجب أن تحتوي على رمز خاص مثل @ # $ !');
  if (username && username.length >= 3 && password.toLowerCase().includes(username.toLowerCase())) {
    problems.push('كلمة المرور يجب ألا تحتوي على اسم المستخدم');
  }
  return problems;
};
