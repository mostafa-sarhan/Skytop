import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILES, addPilgrim, asEmployee, asManager, db, pay, setupTrip } from '../helpers.mjs';

test('missing documents: rows carry pilgrimId / canUploadDocuments; totals match the dashboard', async () => {
  const m = await asManager();
  const e = await asEmployee();
  const ctx = await setupTrip(m);
  const noPhoto = await addPilgrim(e, ctx);
  await addPilgrim(e, ctx, { photo: true });
  const report = (await e.get(`/reports/missing-documents?tripId=${ctx.trip.id}`)).data;
  assert.equal(report.summary.incomplete, 1);
  assert.equal(report.summary.total, 2);
  assert.equal(report.rows[0].pilgrimId, noPhoto.id);
  assert.equal(report.rows[0].canUploadDocuments, true);
  // Completing the file from the report flow (same document endpoint) removes the row.
  const up = await e.form(`/pilgrims/${noPhoto.id}/documents`, { type: 'PERSONAL_PHOTO', file: { buffer: FILES.jpg, type: 'image/jpeg', name: 'p.jpg' } });
  assert.equal(up.status, 201);
  const after = (await e.get(`/reports/missing-documents?tripId=${ctx.trip.id}`)).data;
  assert.equal(after.summary.incomplete, 0);
  const all = (await e.get('/reports/missing-documents')).data;
  const stats = (await m.get('/dashboard/stats')).data;
  assert.equal(stats.documents.incomplete, all.summary.incomplete, 'dashboard and report agree');
});

test('exports: PDF and Excel files are generated with the right types', async () => {
  const m = await asManager();
  const e = await asEmployee();
  const ctx = await setupTrip(m);
  await addPilgrim(e, ctx);
  await pay(e, ctx.delegate.id, { amount: '٢٥٠٠' });
  const exports = [
    `/reports/trip-pilgrims/pdf?tripId=${ctx.trip.id}`,
    `/reports/trip-pilgrims/excel?tripId=${ctx.trip.id}`,
    `/reports/delegate-trip-pilgrims/pdf?tripId=${ctx.trip.id}&delegateId=${ctx.delegate.id}`,
    `/reports/missing-documents/pdf`,
    `/reports/missing-documents/excel`,
    `/reports/account-statement/${ctx.delegate.id}/pdf`,
    `/reports/account-statement/${ctx.delegate.id}/excel`,
    `/reports/payments/pdf`,
    `/reports/payments/excel`,
  ];
  for (const path of exports) {
    const res = await fetch(`${process.env.API_URL}${path}`, { headers: { Cookie: e.session.cookie } });
    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(res.status, 200, path);
    if (path.includes('/pdf')) {
      assert.equal(res.headers.get('content-type'), 'application/pdf', path);
      assert.equal(body.subarray(0, 5).toString(), '%PDF-', path);
    } else {
      assert.match(res.headers.get('content-type'), /spreadsheetml/, path);
      assert.equal(body.subarray(0, 2).toString(), 'PK', path);
    }
    assert.match(res.headers.get('content-disposition'), /attachment; filename=".*"; filename\*=UTF-8''/, path);
  }
  const expensesPdf = await fetch(`${process.env.API_URL}/reports/expenses/pdf`, { headers: { Cookie: m.session.cookie } });
  assert.equal(expensesPdf.status, 200);
  assert.ok(await db.payment.count());
});
