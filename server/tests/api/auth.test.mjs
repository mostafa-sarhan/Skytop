import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { MANAGER, asEmployee, asManager, client, db, login, signToken, strongPassword, uid } from '../helpers.mjs';

const messages = (res) => (res.error?.details ?? []).map((d) => d.message);

/** A user exactly as it existed before the new policy (short name, weak password). */
const legacyUser = async (username, password) =>
  db.user.create({
    data: { username, fullName: 'مستخدم قديم', passwordHash: await bcrypt.hash(password, 10), role: 'EMPLOYEE' },
  });

test('login: success sets an HttpOnly SameSite cookie and never returns secrets', async () => {
  const c = client();
  const res = await c.post('/auth/login', MANAGER);
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /skytop_access_token=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Max-Age=\d+/i);
  assert.ok(!/passwordHash|sessionVersion/.test(res.text));
  assert.equal((await c.get('/auth/me')).data.username, MANAGER.username);
});

test('login: wrong password and unknown user get the same generic 401', async () => {
  const wrong = await client().post('/auth/login', { username: MANAGER.username, password: 'Wrong#Pass123' });
  const unknown = await client().post('/auth/login', { username: `nobody${uid()}`, password: 'Wrong#Pass123' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.error.message, unknown.error.message);
});

test('legacy accounts: short username and pre-policy password still log in, unchanged', async () => {
  const name = `l${uid().slice(0, 3)}`; // 4 characters
  await legacyUser(name, 'oldpass1');
  const res = await client().post('/auth/login', { username: name, password: 'oldpass1' });
  assert.equal(res.status, 200, res.text);
  const row = await db.user.findUnique({ where: { username: name } });
  assert.equal(row.username, name, 'username must not be renamed automatically');
});

test('create user: username must be at least 6 characters (Arabic message)', async () => {
  const m = await asManager();
  const five = await m.post('/users', { fullName: 'مستخدم جديد', username: 'abcde', password: strongPassword(), role: 'EMPLOYEE' });
  assert.equal(five.status, 422);
  assert.ok(messages(five).includes('اسم المستخدم يجب ألا يقل عن 6 أحرف'), JSON.stringify(five.error));
  const six = await m.post('/users', { fullName: 'مستخدم جديد', username: `u${uid().slice(0, 5)}`, password: strongPassword(), role: 'EMPLOYEE' });
  assert.equal(six.status, 201, six.text);
  const long = await m.post('/users', { fullName: 'مستخدم جديد', username: `Long.User_Name-${uid()}`, password: strongPassword(), role: 'EMPLOYEE' });
  assert.equal(long.status, 201, long.text);
  assert.equal(long.data.username, long.data.username.toLowerCase(), 'usernames are stored lowercase');
  const bad = await m.post('/users', { fullName: 'مستخدم جديد', username: 'اسم عربي', password: strongPassword(), role: 'EMPLOYEE' });
  assert.equal(bad.status, 422);
});

test('create user: password policy (each rule, Arabic messages)', async () => {
  const m = await asManager();
  const cases = [
    ['Sh@rt1a', 'كلمة المرور يجب ألا تقل عن 10 أحرف'],
    ['lowercase@123', 'كلمة المرور يجب أن تحتوي على حرف إنجليزي كبير (A-Z)'],
    ['UPPERCASE@123', 'كلمة المرور يجب أن تحتوي على حرف إنجليزي صغير (a-z)'],
    ['NoNumbers@abc', 'كلمة المرور يجب أن تحتوي على رقم (\u20660-9\u2069)'],
    ['NoSpecial1234a', 'كلمة المرور يجب أن تحتوي على رمز خاص مثل @ # $ !'],
  ];
  for (const [password, expected] of cases) {
    const res = await m.post('/users', { fullName: 'مستخدم', username: `p${uid()}`, password, role: 'EMPLOYEE' });
    assert.equal(res.status, 422, password);
    assert.ok(messages(res).includes(expected), `${password}: ${JSON.stringify(messages(res))}`);
  }
  const username = `pw${uid()}`;
  const withName = await m.post('/users', { fullName: 'مستخدم', username, password: `X@1${username}Zz`, role: 'EMPLOYEE' });
  assert.equal(withName.status, 422);
  const ok = await m.post('/users', { fullName: 'مستخدم', username: `ok${uid()}`, password: 'Strong@1234', role: 'EMPLOYEE' });
  assert.equal(ok.status, 201, ok.text);
  const dbRow = await db.user.findUnique({ where: { id: ok.data.id } });
  assert.match(dbRow.passwordHash, /^\$2[aby]\$12\$/, 'bcrypt cost 12');
  assert.equal(dbRow.mustChangePassword, true);
});

test('rename: a NEW username must satisfy the policy; legacy name kept until changed', async () => {
  const m = await asManager();
  const short = `r${uid().slice(0, 3)}`;
  const user = await legacyUser(short, 'oldpass1');
  const keep = await m.patch(`/users/${user.id}`, { fullName: 'اسم معدل', username: short });
  assert.equal(keep.status, 200, 'unchanged legacy username is accepted');
  const tooShort = await m.patch(`/users/${user.id}`, { username: 'abcde' });
  assert.equal(tooShort.status, 422);
  assert.ok(messages(tooShort).includes('اسم المستخدم يجب ألا يقل عن 6 أحرف'));
  const taken = await m.patch(`/users/${user.id}`, { username: MANAGER.username });
  assert.equal(taken.status, 409);
  const next = `renamed${uid()}`;
  const ok = await m.patch(`/users/${user.id}`, { username: next });
  assert.equal(ok.status, 200, ok.text);
  assert.equal((await client().post('/auth/login', { username: short, password: 'oldpass1' })).status, 401);
  assert.equal((await client().post('/auth/login', { username: next, password: 'oldpass1' })).status, 200);
  const audit = await db.auditLog.findFirst({ where: { entityId: user.id, action: 'USERNAME_CHANGED' } });
  assert.deepEqual(audit.oldData, { username: short });
});

test('reset password: strong password required; old sessions and password stop working', async () => {
  const m = await asManager();
  const username = `reset${uid()}`;
  const original = strongPassword();
  const created = await m.post('/users', { fullName: 'مستخدم', username, password: original, role: 'EMPLOYEE' });
  const session = await login({ username, password: original });
  assert.equal((await session.get('/auth/me')).status, 200);
  const weak = await m.post(`/users/${created.data.id}/reset-password`, { newPassword: 'weakpass' });
  assert.equal(weak.status, 422);
  const fresh = strongPassword();
  assert.equal((await m.post(`/users/${created.data.id}/reset-password`, { newPassword: fresh })).status, 200);
  assert.equal((await session.get('/auth/me')).status, 401, 'token issued before the reset is rejected');
  assert.equal((await client().post('/auth/login', { username, password: original })).status, 401);
  const after = await client().post('/auth/login', { username, password: fresh });
  assert.equal(after.status, 200);
  assert.equal(after.data.user.mustChangePassword, true);
  const audit = await db.auditLog.findFirst({ where: { entityId: created.data.id, action: 'PASSWORD_RESET' } });
  assert.ok(!JSON.stringify(audit).includes(fresh), 'password never stored in the audit trail');
});

test('change password: policy, current password, other sessions end, this one continues', async () => {
  const m = await asManager();
  const username = `change${uid()}`;
  const first = strongPassword();
  await m.post('/users', { fullName: 'مستخدم', username, password: first, role: 'EMPLOYEE' });
  const tabA = await login({ username, password: first });
  const tabB = await login({ username, password: first });
  assert.equal((await tabA.post('/auth/change-password', { currentPassword: first, newPassword: 'short' })).status, 422);
  const wrongCurrent = await tabA.post('/auth/change-password', { currentPassword: 'Wrong#123456', newPassword: strongPassword() });
  assert.equal(wrongCurrent.status, 400);
  const second = strongPassword();
  const changed = await tabA.post('/auth/change-password', { currentPassword: first, newPassword: second });
  assert.equal(changed.status, 200, changed.text);
  assert.equal((await tabA.get('/auth/me')).status, 200, 'the session that changed the password stays signed in');
  assert.equal((await tabB.get('/auth/me')).status, 401, 'other sessions end');
  assert.equal((await tabA.get('/auth/me')).data.mustChangePassword, false);
  const audit = await db.auditLog.findFirst({ where: { action: 'PASSWORD_CHANGED', newData: { path: ['username'], equals: username } } });
  assert.ok(audit, 'PASSWORD_CHANGED audited');
  assert.ok(!JSON.stringify(audit).includes(second));
});

test('deactivation ends sessions immediately; reactivation does not revive old tokens', async () => {
  const m = await asManager();
  const username = `deact${uid()}`;
  const password = strongPassword();
  const created = await m.post('/users', { fullName: 'مستخدم', username, password, role: 'EMPLOYEE' });
  const session = await login({ username, password });
  assert.equal((await m.patch(`/users/${created.data.id}`, { isActive: false })).status, 200);
  assert.equal((await session.get('/auth/me')).status, 401);
  assert.equal((await client().post('/auth/login', { username, password })).status, 401);
  assert.equal((await m.patch(`/users/${created.data.id}`, { isActive: true })).status, 200);
  assert.equal((await session.get('/auth/me')).status, 401, 'old token stays invalid after reactivation');
  assert.equal((await client().post('/auth/login', { username, password })).status, 200);
});

test('tokens: legacy tokens without a session version work until the account changes; forged ones never', async () => {
  const user = await legacyUser(`tok${uid()}`, 'oldpass1');
  const legacy = client(`skytop_access_token=${signToken({ id: user.id })}`);
  assert.equal((await legacy.get('/auth/me')).status, 200);
  await db.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
  assert.equal((await legacy.get('/auth/me')).status, 401);
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ id: user.id })).toString('base64url')}.`;
  assert.equal((await client(`skytop_access_token=${none}`).get('/auth/me')).status, 401);
  assert.equal((await client('skytop_access_token=garbage').get('/auth/me')).status, 401);
});

test('roles: employees cannot manage users; a manager cannot deactivate or demote themselves', async () => {
  const e = await asEmployee();
  assert.equal((await e.get('/users')).status, 403);
  const someone = await db.user.findFirst({ where: { role: 'EMPLOYEE' } });
  assert.equal((await e.post(`/users/${someone.id}/reset-password`, { newPassword: strongPassword() })).status, 403);
  const m = await asManager();
  const me = (await m.get('/auth/me')).data;
  assert.equal((await m.patch(`/users/${me.id}`, { isActive: false })).status, 400);
  assert.equal((await m.patch(`/users/${me.id}`, { role: 'EMPLOYEE' })).status, 400);
});

test('lockout: repeated failures lock that account (any IP) without affecting others', async () => {
  const m = await asManager();
  const username = `lock${uid()}`;
  const password = strongPassword();
  await m.post('/users', { fullName: 'مستخدم', username, password, role: 'EMPLOYEE' });
  // tests/run.mjs sets LOGIN_FAILURES_PER_ACCOUNT=5
  for (let i = 0; i < 5; i += 1) assert.equal((await client().post('/auth/login', { username, password: 'Wrong#Pass1' })).status, 401);
  const locked = await client().post('/auth/login', { username, password });
  assert.equal(locked.status, 429, 'correct password refused while locked');
  assert.match(locked.error.message, /مؤقتاً/);
  assert.equal((await client().post('/auth/login', MANAGER)).status, 200, 'other accounts unaffected');
});

test('logout clears the cookie', async () => {
  const m = await asManager();
  const res = await m.post('/auth/logout');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie'), /skytop_access_token=;/);
  assert.equal((await m.get('/auth/me')).status, 401);
});
