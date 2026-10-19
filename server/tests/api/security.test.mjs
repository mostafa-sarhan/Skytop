import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API, asManager, assertNoInternals, client } from '../helpers.mjs';

test('headers: security headers on, X-Powered-By off, API responses never cached', async () => {
  const res = await fetch(`${API}/health`);
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('x-frame-options'));
  assert.ok(res.headers.get('content-security-policy'));
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('request id: generated when absent, kept when safe, replaced when unsafe', async () => {
  const generated = await fetch(`${API}/health/live`);
  assert.match(generated.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  const kept = await fetch(`${API}/health/live`, { headers: { 'X-Request-Id': 'nginx-req-12345678' } });
  assert.equal(kept.headers.get('x-request-id'), 'nginx-req-12345678');
  const unsafe = await fetch(`${API}/health/live`, { headers: { 'X-Request-Id': 'bad id <script>' } });
  assert.notEqual(unsafe.headers.get('x-request-id'), 'bad id <script>');
});

test('health: readiness checks the database; liveness is dependency-free; nothing sensitive', async () => {
  const ready = await client().get('/health');
  assert.equal(ready.status, 200);
  assert.equal(ready.data.status, 'ok');
  assert.equal(ready.data.database, 'ok');
  const live = await client().get('/health/live');
  assert.equal(live.status, 200);
  for (const body of [ready.text, live.text]) assert.ok(!/postgres(ql)?:|password|secret|jwt|node_env|version|host/i.test(body), body);
});

test('errors: malformed JSON → 400 JSON, oversized body → 413, unknown route → 404; no internals', async () => {
  const c = await asManager();
  const malformed = await c.raw('POST', '/delegates', { raw: '{"name": ', headers: { 'Content-Type': 'application/json' } });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.json.success, false);
  assert.ok(malformed.error.requestId, 'error carries the request id');
  assertNoInternals(malformed.text);
  const big = await c.raw('POST', '/delegates', { raw: JSON.stringify({ name: 'x'.repeat(2 * 1024 * 1024) }), headers: { 'Content-Type': 'application/json' } });
  assert.equal(big.status, 413);
  assertNoInternals(big.text);
  const missing = await c.get('/no-such-route?secret=1');
  assert.equal(missing.status, 404);
  assert.ok(!missing.text.includes('secret=1'), 'query string not echoed');
  const badId = await c.get('/delegates/not-a-uuid');
  assert.equal(badId.status, 422);
  assertNoInternals(badId.text);
});

test('errors: duplicate values do not reveal column names', async () => {
  const m = await asManager();
  const username = `dup${Date.now()}`;
  await m.post('/users', { fullName: 'مستخدم', username, password: 'Strong@1234', role: 'EMPLOYEE' });
  const dup = await m.post('/users', { fullName: 'مستخدم', username, password: 'Strong@1234', role: 'EMPLOYEE' });
  assert.equal(dup.status, 409);
  assert.ok(!/username_key|unique|constraint/i.test(dup.text), dup.text);
});

test('auth required: protected endpoints answer 401 without a session', async () => {
  for (const path of ['/dashboard/stats', '/delegates', '/payments', '/reports/missing-documents', '/users', '/audit']) {
    const res = await client().get(path);
    assert.equal(res.status, 401, path);
    assertNoInternals(res.text);
  }
});

test('CORS: only the configured origin is allowed (with credentials)', async () => {
  const allowed = await fetch(`${API}/health`, { headers: { Origin: 'http://allowed.test' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://allowed.test');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  const other = await fetch(`${API}/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});
