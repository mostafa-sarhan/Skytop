import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPilgrim, asEmployee, asManager, assertNoInternals, db, pay, setupTrip, uid } from '../helpers.mjs';

test('account: required = active pilgrims × price; paid excludes voided; remaining = required − paid', async () => {
  const m = await asManager();
  const e = await asEmployee();
  const ctx = await setupTrip(m, { price: '30000' });
  await addPilgrim(e, ctx);
  await addPilgrim(e, ctx);
  const p1 = await pay(e, ctx.delegate.id, { amount: '١٠٠٠٠' });
  assert.equal(p1.status, 201, p1.text);
  assert.equal(p1.data.amount, '10000.00');
  const p2 = await pay(e, ctx.delegate.id, { amount: '5000.50' });
  assert.equal(p2.status, 201);
  assert.equal((await m.post(`/payments/${p2.data.id}/void`, { reason: 'خطأ في التسجيل' })).status, 200);
  const account = (await e.get(`/finance/delegates/${ctx.delegate.id}/balance`)).data;
  assert.equal(account.totalRequired, '60000.00');
  assert.equal(account.totalPaid, '10000.00');
  assert.equal(account.remaining, '50000.00');
  assert.equal(account.status, 'DUE');
});

test('receipts: Arabic-Indic / Persian / leading-zero forms are the same receipt, forever', async () => {
  const e = await asEmployee();
  const m = await asManager();
  const { delegate } = await setupTrip(m);
  const n = String(Date.now()).slice(-7);
  const toArabic = (s) => s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  const toPersian = (s) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const first = await pay(e, delegate.id, { receiptNumber: toArabic(n) });
  assert.equal(first.status, 201, first.text);
  assert.equal(first.data.receiptNumber, n, 'stored with Western digits');
  for (const variant of [n, toPersian(n), `000${n}`, ` ${n} `]) {
    const dup = await pay(e, delegate.id, { receiptNumber: variant });
    assert.equal(dup.status, 409, `variant ${variant}`);
  }
  assert.equal((await m.post(`/payments/${first.data.id}/void`, { reason: 'إيصال ملغى' })).status, 200);
  assert.equal((await pay(e, delegate.id, { receiptNumber: n })).status, 409, 'a voided receipt number stays reserved');
});

test('receipts: concurrent submissions of one receipt number create exactly one payment', async () => {
  const e = await asEmployee();
  const m = await asManager();
  const { delegate } = await setupTrip(m);
  const receiptNumber = `C${uid()}`;
  const results = await Promise.all(Array.from({ length: 6 }, () => pay(e, delegate.id, { receiptNumber })));
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses.filter((s) => s === 201).length, 1, statuses.join(','));
  assert.ok(statuses.filter((s) => s !== 201).every((s) => s === 409), statuses.join(','));
});

test('money input: Arabic digits accepted exactly; malformed values are 422, never 500', async () => {
  const e = await asEmployee();
  const m = await asManager();
  const { delegate } = await setupTrip(m);
  const ok = await pay(e, delegate.id, { amount: '۱۲۵۰۰٫۷۵', paymentMethod: 'TRANSFER', transferType: 'INSTAPAY', referenceNumber: 'IP-٤٤٥٥' });
  assert.equal(ok.status, 201, ok.text);
  assert.equal(ok.data.amount, '12500.75');
  assert.equal(ok.data.referenceNumber, 'IP-4455');
  for (const amount of ['12x', 'abc', '10.123', '0', '-5', '1e5', '']) {
    const bad = await pay(e, delegate.id, { amount });
    assert.equal(bad.status, 422, `amount "${amount}" → ${bad.status}`);
    assertNoInternals(bad.text);
  }
  const search = await e.get(`/payments?search=${encodeURIComponent('٤٤٥٥')}`);
  assert.equal(search.status, 200);
});

test('void: managers only, reason required; void details hidden from employees', async () => {
  const e = await asEmployee();
  const m = await asManager();
  const { delegate } = await setupTrip(m);
  const p = (await pay(e, delegate.id)).data;
  assert.equal((await e.post(`/payments/${p.id}/void`, { reason: 'محاولة' })).status, 403);
  assert.equal((await m.post(`/payments/${p.id}/void`, { reason: '' })).status, 422);
  assert.equal((await m.post(`/payments/${p.id}/void`, { reason: 'خطأ في المبلغ' })).status, 200);
  const asEmp = (await e.get(`/payments/${p.id}`)).data;
  assert.equal(asEmp.status, 'VOIDED');
  assert.equal(asEmp.voidReason, null);
  assert.equal((await m.get(`/payments/${p.id}`)).data.voidReason, 'خطأ في المبلغ');
});

test('refunds / corrections: managers only; amounts normalized; audited', async () => {
  const e = await asEmployee();
  const m = await asManager();
  const { delegate } = await setupTrip(m);
  assert.equal((await e.post('/finance/corrections', { delegateId: delegate.id, amount: '100', direction: 'INCREASE', reason: 'تصحيح' })).status, 403);
  const corr = await m.post('/finance/corrections', { delegateId: delegate.id, amount: '١٥٠٫٢٥', direction: 'INCREASE', reason: 'تصحيح رقمي' });
  assert.equal(corr.status, 201, corr.text);
  const row = await db.financialAdjustment.findFirst({ where: { delegateId: delegate.id } });
  assert.equal(row.amount.toFixed(2), '150.25');
  const account = (await m.get(`/finance/delegates/${delegate.id}/balance`)).data;
  assert.equal(account.correctionsNet, '150.25');
  assert.ok(await db.auditLog.findFirst({ where: { action: 'FINANCIAL_CORRECTION', entityId: row.id } }));
});
