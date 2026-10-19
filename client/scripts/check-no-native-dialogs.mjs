#!/usr/bin/env node
/**
 * Fails when production client code calls a native browser dialog
 * (alert / confirm / prompt — "localhost says ... OK / Cancel"). Use the
 * shared ConfirmDialog (src/ui/ConfirmDialog.tsx) or Modal instead.
 * oxlint's `no-alert` rule enforces the same in `npm run lint`; this script
 * is a dependency-free guard that also catches `globalThis.` / `self.` forms.
 *
 * Usage: npm run check:dialogs   (exit 1 on any finding)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const SKIP = /(\.test\.|\.spec\.|__mocks__|__tests__)/;
// A call of alert/confirm/prompt that is not a method of another object
// (e.g. `toast.confirm(` is fine), or any window/globalThis/self property call.
const PATTERNS = [
  /(?<![\w$.])(alert|confirm|prompt)\s*\(/g,
  /\b(window|globalThis|self)\s*\.\s*(alert|confirm|prompt)\b/g,
];

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(name) && !SKIP.test(full)) files.push(full);
  }
};
walk(root);

const findings = [];
for (const file of files) {
  // Ignore comments so documentation can mention the APIs.
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (m, p) => p + ' '.repeat(m.length - p.length));
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(line)) findings.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (findings.length) {
  console.error('Native browser dialogs are not allowed (use ConfirmDialog / Modal):');
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`check:dialogs OK — no native alert/confirm/prompt in ${files.length} source files`);
