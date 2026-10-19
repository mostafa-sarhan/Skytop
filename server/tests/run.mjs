#!/usr/bin/env node
/**
 * API integration tests against a real PostgreSQL database and a real API
 * process.
 *
 *   npm run test:api                 # API from TypeScript sources (tsx)
 *   npm run test:api -- --dist       # API from the compiled build (dist/)
 *   npm run test:api -- --keep       # keep the test database afterwards
 *   npm run test:api -- auth         # only tests/api/auth.test.mjs
 *
 * Safety: the database comes from TEST_DATABASE_URL (default
 * postgresql://postgres@localhost:5432/sky_top_test) and its name MUST end in
 * "_test" — it is dropped and re-created on every run. The runner refuses to
 * run with NODE_ENV=production. Credentials are generated per run and never
 * printed.
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const useDist = args.includes('--dist');
const keep = args.includes('--keep');
const only = args.filter((a) => !a.startsWith('--'));

const fail = (message) => {
  console.error(`test:api refused: ${message}`);
  process.exit(2);
};

if (process.env.NODE_ENV === 'production') fail('NODE_ENV is production');
const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/sky_top_test';
const dbUrl = new URL(databaseUrl);
const dbName = decodeURIComponent(dbUrl.pathname.slice(1));
if (!/^[a-z0-9_]+_test$/.test(dbName)) fail(`database name "${dbName}" must end in _test (it is dropped on every run)`);

// 1. Fresh database (maintenance connection to the same server).
const adminUrl = new URL(databaseUrl);
adminUrl.pathname = '/postgres';
const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
await admin.$disconnect();

const run = (command, commandArgs, env) => {
  const result = spawnSync(command, commandArgs, { cwd: serverDir, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    throw new Error(`${command} ${commandArgs.join(' ')} failed`);
  }
  return result.stdout;
};

// 2. Production migration flow (never `migrate reset`).
run('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: databaseUrl });

// 3. Bootstrap accounts through the real seed (policy-compliant credentials).
const strong = () => `Tt@${crypto.randomBytes(9).toString('base64url')}9`;
const credentials = {
  TEST_MANAGER_USERNAME: 'test.manager',
  TEST_MANAGER_PASSWORD: strong(),
  TEST_EMPLOYEE_USERNAME: 'test.employee',
  TEST_EMPLOYEE_PASSWORD: strong(),
};
run('npx', ['tsx', 'prisma/seed.ts'], {
  DATABASE_URL: databaseUrl,
  SEED_MANAGER_USERNAME: credentials.TEST_MANAGER_USERNAME,
  SEED_MANAGER_PASSWORD: credentials.TEST_MANAGER_PASSWORD,
  SEED_EMPLOYEE_USERNAME: credentials.TEST_EMPLOYEE_USERNAME,
  SEED_EMPLOYEE_PASSWORD: credentials.TEST_EMPLOYEE_PASSWORD,
});

// 4. API process on a free port with private, temporary uploads.
const freePort = () =>
  new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
const port = await freePort();
const uploadDir = mkdtempSync(path.join(os.tmpdir(), 'skytop-test-uploads-'));
const jwtSecret = crypto.randomBytes(32).toString('hex');
const serverEnv = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: String(port),
  DATABASE_URL: databaseUrl,
  JWT_SECRET: jwtSecret,
  UPLOAD_DIR: uploadDir,
  CORS_ORIGIN: 'http://allowed.test',
  TRUST_PROXY: 'false',
  COOKIE_SECURE: 'false',
  JWT_EXPIRES_IN: '12h',
  MAX_UPLOAD_BYTES: String(8 * 1024 * 1024),
  RATE_LIMIT_WINDOW_MS: '60000',
  SERVE_CLIENT_DIR: '',
  RATE_LIMIT_MAX: '100000',
  LOGIN_RATE_LIMIT_MAX: '100000',
  SENSITIVE_RATE_LIMIT_MAX: '100000',
  UPLOAD_RATE_LIMIT_MAX: '100000',
  // Small on purpose: the lockout itself is tested (auth.test.mjs).
  LOGIN_FAILURES_PER_ACCOUNT: '5',
};
const api = useDist
  ? spawn('node', ['dist/src/server.js'], { cwd: serverDir, env: { ...process.env, ...serverEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
  : spawn('npx', ['tsx', 'src/server.ts'], { cwd: serverDir, env: { ...process.env, ...serverEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
let apiOutput = '';
api.stdout.on('data', (d) => (apiOutput += d));
api.stderr.on('data', (d) => (apiOutput += d));
const apiUrl = `http://127.0.0.1:${port}/api/v1`;
let ready = false;
for (let i = 0; i < 120 && !ready; i += 1) {
  try {
    ready = (await fetch(`${apiUrl}/health`)).ok;
  } catch {
    await new Promise((r) => setTimeout(r, 250));
  }
}

let code = 1;
try {
  if (!ready) throw new Error(`API did not start:\n${apiOutput}`);
  const testDir = path.join(serverDir, 'tests', 'api');
  const files = readdirSync(testDir)
    .filter((f) => f.endsWith('.test.mjs'))
    .filter((f) => only.length === 0 || only.some((o) => f.startsWith(o)))
    .map((f) => path.join(testDir, f));
  // One file at a time: they share the database.
  const result = spawnSync('node', ['--test', '--test-concurrency=1', ...files], {
    cwd: serverDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...credentials,
      API_URL: apiUrl,
      DATABASE_URL: databaseUrl,
      UPLOAD_DIR: uploadDir,
      JWT_SECRET_FOR_TESTS: jwtSecret,
      SERVER_DIR: serverDir,
    },
  });
  code = result.status ?? 1;
} finally {
  api.kill('SIGTERM');
  await new Promise((r) => api.once('exit', r));
  rmSync(uploadDir, { recursive: true, force: true });
  if (!keep) {
    const cleanup = new PrismaClient({ datasourceUrl: adminUrl.toString() });
    await cleanup.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await cleanup.$disconnect();
  }
}
process.exit(code);
