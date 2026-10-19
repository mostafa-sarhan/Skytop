import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { FILES, UPLOAD_DIR, addPilgrim, asEmployee, asManager, assertNoInternals, client, db, pay, setupTrip, uid } from '../helpers.mjs';

const file = (buffer, type, name) => ({ buffer, type, name });

test('pilgrim documents: passport required, private download with safe headers', async () => {
  const m = await asManager();
  const e = await asEmployee();
  const ctx = await setupTrip(m);
  const noPassport = await e.form('/pilgrims', { name: 'معتمر بلا جواز', passportNumber: `N${uid()}`, delegateId: ctx.delegate.id, tripId: ctx.trip.id });
  assert.equal(noPassport.status, 400);
  const pilgrim = await addPilgrim(e, ctx);
  assert.ok(!JSON.stringify(pilgrim).includes('storageKey'), 'storage keys never leave the server');

  const anonymous = await client().get(`/documents/${pilgrim.id}/PASSPORT_IMAGE`);
  assert.equal(anonymous.status, 401);
  const res = await e.get(`/documents/${pilgrim.id}/PASSPORT_IMAGE`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-disposition'), /^inline; filename="[\x20-\x7e]*"; filename\*=UTF-8''%D8%AC%D9%88%D8%A7%D8%B2\.png$/);
  assert.equal((await e.get(`/documents/${pilgrim.id}/NOT_A_TYPE`)).status, 422);
  assert.equal((await e.get(`/documents/..%2F..%2Fetc/PASSPORT_IMAGE`)).status, 422);
});

test('uploads: type sniffing, size limit and allowed types are enforced', async () => {
  const m = await asManager();
  const e = await asEmployee();
  const ctx = await setupTrip(m);
  const pilgrim = await addPilgrim(e, ctx);
  const upload = (f) => e.form(`/pilgrims/${pilgrim.id}/documents`, { type: 'PERSONAL_PHOTO', file: f });
  const fake = await upload(file(Buffer.from('<html><script>alert(1)</script></html>'), 'image/png', 'evil.png'));
  assert.equal(fake.status, 400);
  assert.match(fake.error.message, /لا يطابق/);
  assert.equal((await upload(file(Buffer.from('GIF89a'), 'image/gif', 'x.gif'))).status, 400);
  assert.equal((await upload(file(Buffer.from('<svg/>'), 'image/svg+xml', 'x.svg'))).status, 400);
  const big = await upload(file(Buffer.concat([FILES.png, Buffer.alloc(9 * 1024 * 1024)]), 'image/png', 'big.png'));
  assert.equal(big.status, 400);
  assert.match(big.error.message, /حجم الملف/);
  const ok = await upload(file(FILES.jpg, 'image/jpeg', 'صورة.jpg'));
  assert.equal(ok.status, 201, ok.text);
  assert.equal((await e.get(`/documents/${pilgrim.id}/PERSONAL_PHOTO`)).status, 200);
  assert.equal((await e.del(`/pilgrims/${pilgrim.id}/documents/PASSPORT_IMAGE`)).status, 400, 'passport can be replaced, not removed');
  assert.equal((await e.del(`/pilgrims/${pilgrim.id}/documents/PERSONAL_PHOTO`)).status, 200);
});

test('missing file on disk: clean Arabic 404, no paths or internals', async () => {
  const m = await asManager();
  const e = await asEmployee();
  const pilgrim = await addPilgrim(e, await setupTrip(m));
  const doc = await db.pilgrimDocument.findFirst({ where: { pilgrimId: pilgrim.id, type: 'PASSPORT_IMAGE' } });
  unlinkSync(path.join(UPLOAD_DIR, doc.storageKey));
  const res = await e.get(`/documents/${pilgrim.id}/PASSPORT_IMAGE`);
  assert.equal(res.status, 404);
  assert.equal(res.error.message, 'ملف الوثيقة غير متاح على الخادم');
  assertNoInternals(res.text);
  assert.ok(!res.text.includes(doc.storageKey));
});

test('files are stored under generated names inside UPLOAD_DIR only', async () => {
  const m = await asManager();
  const e = await asEmployee();
  const pilgrim = await addPilgrim(e, await setupTrip(m));
  const doc = await db.pilgrimDocument.findFirst({ where: { pilgrimId: pilgrim.id } });
  assert.match(doc.storageKey, new RegExp(`^${pilgrim.id}/PASSPORT_IMAGE_[0-9a-f-]{36}\\.png$`));
  assert.equal(doc.originalName, 'جواز.png');
});

test('receipt scans and expense invoices: authenticated, private, typed', async () => {
  const m = await asManager();
  const e = await asEmployee();
  const { delegate } = await setupTrip(m);
  const payment = (await pay(e, delegate.id)).data;
  assert.equal((await client().get(`/payments/${payment.id}/receipt-scan`)).status, 401);
  const scan = await e.get(`/payments/${payment.id}/receipt-scan`);
  assert.equal(scan.status, 200);
  assert.equal(scan.headers.get('cache-control'), 'private, no-store');
  const expense = await e.form('/expenses', {
    category: 'ELECTRICITY', amount: '120', expenseDate: '2026-10-10', paymentMethod: 'CASH', description: 'فاتورة اختبار',
    file: file(FILES.pdf, 'application/pdf', 'فاتورة.pdf'),
  });
  assert.equal(expense.status, 201, expense.text);
  assert.equal((await client().get(`/expenses/${expense.data.id}/attachment`)).status, 401);
  const inv = await e.get(`/expenses/${expense.data.id}/attachment`);
  assert.equal(inv.status, 200);
  assert.equal(inv.headers.get('content-type'), 'application/pdf');
});

test('completed trips: documents are read-only (rule unchanged)', async () => {
  const m = await asManager();
  const e = await asEmployee();
  const ctx = await setupTrip(m);
  const pilgrim = await addPilgrim(e, ctx);
  for (const status of ['CLOSED', 'COMPLETED']) assert.equal((await m.post(`/trips/${ctx.trip.id}/status`, { status })).status, 200);
  const res = await e.form(`/pilgrims/${pilgrim.id}/documents`, { type: 'PERSONAL_PHOTO', file: file(FILES.jpg, 'image/jpeg', 'p.jpg') });
  assert.ok(res.status >= 400 && res.status < 500, `${res.status}`);
});
