import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { SERVER_DIR } from '../helpers.mjs';

/** Loads src/config/env.ts in a child process with exactly `vars` (production ignores server/.env). */
const loadEnv = (vars) =>
  spawnSync('npx', ['tsx', '-e', "require('./src/config/env'); console.log('ENV_OK')"], {
    cwd: SERVER_DIR,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...vars },
  });

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://skytop:pw@127.0.0.1:5432/skytop',
  JWT_SECRET: 'f3a9c1e07b5d42e8a6c0d9b1e2f4a7c3b8d6e0f1a2c3d4e5',
  COOKIE_SECURE: 'true',
  CORS_ORIGIN: 'https://skytop.travel',
  TRUST_PROXY: 'loopback',
  UPLOAD_DIR: '/var/lib/skytop/uploads',
};

test('production config: a complete, safe configuration loads', () => {
  const res = loadEnv(production);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /ENV_OK/);
});

test('production config: unsafe or missing values fail fast without printing secrets', () => {
  const cases = [
    [{ JWT_SECRET: 'CHANGE_ME_TO_A_RANDOM_STRING_OF_AT_LEAST_32_CHARS' }, /JWT_SECRET/],
    [{ JWT_SECRET: 'short' }, /JWT_SECRET/],
    [{ COOKIE_SECURE: 'false' }, /COOKIE_SECURE/],
    [{ CORS_ORIGIN: '*' }, /CORS_ORIGIN/],
    [{ CORS_ORIGIN: undefined }, /CORS_ORIGIN/],
    [{ UPLOAD_DIR: 'uploads' }, /UPLOAD_DIR/],
    [{ TRUST_PROXY: undefined }, /TRUST_PROXY/],
    [{ TRUST_PROXY: 'true' }, /TRUST_PROXY/],
    [{ DATABASE_URL: undefined }, /DATABASE_URL/],
    [{ DATABASE_URL: 'mysql://x' }, /DATABASE_URL/],
  ];
  for (const [override, expected] of cases) {
    const vars = { ...production, ...override };
    for (const [k, v] of Object.entries(vars)) if (v === undefined) delete vars[k];
    const res = loadEnv(vars);
    assert.notEqual(res.status, 0, JSON.stringify(override));
    assert.match(res.stderr, expected, JSON.stringify(override));
    assert.ok(!res.stderr.includes('f3a9c1e07b5d42e8'), 'secret value never printed');
    assert.ok(!res.stderr.includes(':pw@'), 'database password never printed');
  }
});

test('demo seed refuses production', () => {
  const res = spawnSync('npx', ['tsx', 'prisma/demo-seed.ts'], {
    cwd: SERVER_DIR,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...production, ALLOW_DEMO_SEED: 'true' },
  });
  assert.notEqual(res.status, 0);
  assert.match(res.stdout + res.stderr, /production/i);
});
