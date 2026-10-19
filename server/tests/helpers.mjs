/** Shared helpers for tests/api/*.test.mjs (started by tests/run.mjs). */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export const API = process.env.API_URL;
if (!API) throw new Error('Run the API tests with `npm run test:api` (tests/run.mjs sets API_URL).');

export const MANAGER = { username: process.env.TEST_MANAGER_USERNAME, password: process.env.TEST_MANAGER_PASSWORD };
export const EMPLOYEE = { username: process.env.TEST_EMPLOYEE_USERNAME, password: process.env.TEST_EMPLOYEE_PASSWORD };
export const UPLOAD_DIR = process.env.UPLOAD_DIR;
export const SERVER_DIR = process.env.SERVER_DIR;

export const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

/** Unique suffix so test files never collide on names / numbers. */
export const uid = () => crypto.randomBytes(4).toString('hex');

/** A policy-compliant password. */
export const strongPassword = () => `Pw#${crypto.randomBytes(8).toString('base64url')}7a`;

/** Minimal valid files (content must match the declared type). */
export const FILES = {
  png: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  jpg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]),
  pdf: Buffer.from('%PDF-1.4\n%test\n%%EOF\n'),
};

const parse = async (res) => {
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON (files, PDFs...) */
  }
  return { status: res.status, headers: res.headers, json, data: json?.data, error: json?.error, text };
};

/** A logged-in (or anonymous) API client keeping its own session cookie. */
export const client = (cookie = null) => {
  const session = { cookie };
  const request = async (method, path, { body, headers = {}, form, raw } = {}) => {
    const init = { method, headers: { ...headers }, redirect: 'manual' };
    if (session.cookie) init.headers.Cookie = session.cookie;
    if (form) {
      const fd = new FormData();
      for (const [key, value] of Object.entries(form)) {
        if (value === undefined) continue;
        if (value && typeof value === 'object' && 'buffer' in value) {
          fd.append(key, new Blob([value.buffer], { type: value.type }), value.name);
        } else fd.append(key, String(value));
      }
      init.body = fd;
    } else if (raw !== undefined) {
      init.body = raw;
    } else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${API}${path}`, init);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie?.startsWith('skytop_access_token=')) {
      const value = setCookie.split(';')[0];
      session.cookie = value.endsWith('=') ? null : value;
    }
    return parse(res);
  };
  return {
    session,
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts = {}) => request('POST', path, { ...opts, body }),
    patch: (path, body, opts = {}) => request('PATCH', path, { ...opts, body }),
    del: (path, opts) => request('DELETE', path, opts),
    form: (path, form, method = 'POST') => request(method, path, { form }),
    raw: (method, path, opts) => request(method, path, opts),
  };
};

/** Logs in and returns a client carrying the session (asserts success). */
export const login = async ({ username, password }) => {
  const c = client();
  const res = await c.post('/auth/login', { username, password });
  if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status} ${res.text}`);
  return c;
};

export const asManager = () => login(MANAGER);
export const asEmployee = () => login(EMPLOYEE);

/** Creates a delegate, an OPEN trip and the assignment (price per pilgrim). */
export const setupTrip = async (manager, { price = '30000' } = {}) => {
  const id = uid();
  const delegate = (await manager.post('/delegates', { name: `مندوب اختبار ${id}`, phone: `010${Math.floor(10000000 + Math.random() * 89999999)}`, address: 'القاهرة' })).data;
  const trip = (await manager.post('/trips', { name: `رحلة اختبار ${id}`, departureDate: '2027-03-01', returnDate: '2027-03-12', flightType: 'DIRECT' })).data;
  const assignment = await manager.post(`/trips/${trip.id}/delegates`, { delegateId: delegate.id, pricePerPerson: price });
  if (assignment.status !== 201) throw new Error(`assignment failed ${assignment.text}`);
  return { delegate, trip };
};

/** Adds a pilgrim with the required passport image (and optional photo). */
export const addPilgrim = async (c, { delegate, trip }, { photo = false, name } = {}) => {
  const res = await c.form('/pilgrims', {
    name: name ?? `معتمر اختبار ${uid()}`,
    passportNumber: `T${uid().toUpperCase()}`,
    delegateId: delegate.id,
    tripId: trip.id,
    passportImage: { buffer: FILES.png, type: 'image/png', name: 'جواز.png' },
    personalPhoto: photo ? { buffer: FILES.jpg, type: 'image/jpeg', name: 'photo.jpg' } : undefined,
  });
  if (res.status !== 201) throw new Error(`pilgrim create failed ${res.status} ${res.text}`);
  return res.data;
};

/** Records a payment (receipt scan required). */
export const pay = (c, delegateId, fields = {}) =>
  c.form('/payments', {
    delegateId,
    amount: '1000',
    receiptNumber: `R${uid()}`,
    paymentDate: '2026-10-18',
    paymentMethod: 'CASH',
    file: { buffer: FILES.png, type: 'image/png', name: 'إيصال.png' },
    ...fields,
  });

/** HS256 token signed with the test server's secret (for legacy-token tests). */
export const signToken = (payload) => {
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const body = enc({ iat: now, exp: now + 3600, ...payload });
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET_FOR_TESTS).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};

/** Error bodies must never leak internals. */
export const assertNoInternals = (text) => {
  const leaks = [/prisma/i, /\bstack\b/i, /node_modules/, /\/Users\//, /\/home\//, /at \w+ \(/, /SELECT |INSERT |UPDATE /];
  const found = leaks.filter((re) => re.test(text));
  if (found.length) throw new Error(`response leaks internals (${found.join(', ')}): ${text.slice(0, 300)}`);
};
