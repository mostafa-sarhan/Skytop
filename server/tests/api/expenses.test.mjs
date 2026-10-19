import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asEmployee, asManager } from '../helpers.mjs';

const create = (c, fields) =>
  c.form('/expenses', { category: 'INTERNET', amount: '100', expenseDate: '2026-10-05', paymentMethod: 'CASH', description: 'اشتراك اختبار', ...fields });

test('expenses: Arabic digits, totals exclude voided, managers void with a reason', async () => {
  const e = await asEmployee();
  const m = await asManager();
  const before = (await e.get('/expenses/summary')).data;
  const a = await create(e, { amount: '١٥٠٠٫٥٠', paymentMethod: 'TRANSFER', transferType: 'INSTAPAY', referenceNumber: '٩٩٨٨' });
  assert.equal(a.status, 201, a.text);
  assert.equal(a.data.amount, '1500.50');
  assert.equal(a.data.referenceNumber, '9988');
  const b = (await create(e, { amount: '200' })).data;
  assert.equal((await e.post(`/expenses/${b.id}/void`, { reason: 'خطأ' })).status, 403);
  assert.equal((await m.post(`/expenses/${b.id}/void`, { reason: '' })).status, 422);
  assert.equal((await m.post(`/expenses/${b.id}/void`, { reason: 'مكرر' })).status, 200);
  const after = (await e.get('/expenses/summary')).data;
  const diff = (Number(after.totalActive) * 100 - Number(before.totalActive) * 100) / 100;
  assert.equal(diff, 1500.5, 'only the active expense counts');
  assert.equal((await create(e, { amount: '12x' })).status, 422);
});
