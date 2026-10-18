#!/usr/bin/env node
/**
 * RTL overflow regression check (dev/QA tool, no dependencies).
 *
 * Detects content that extends outside the viewport on EITHER side of an RTL
 * page. `document.scrollWidth` alone misses overflow to the right in RTL
 * (that side is not scrollable), so three signals are combined:
 *   1. document scroll width > viewport      (classic overflow)
 *   2. layout content width > viewport       (Chrome DevTools metrics; catches RTL right-side overflow)
 *   3. element scan: visible elements past the left or right edge that are not
 *      inside an intentional scroll/clip container (e.g. .table-wrap)
 *
 * Usage (against a running stack):
 *   APP_URL=http://localhost:5173 API_URL=http://localhost:4000/api/v1 \
 *   CHECK_USER=<username> CHECK_PASSWORD=<password> npm run check:rtl
 *
 * Options (env): WIDTHS=1280,1024,390  THEMES=light,dark  CHROME_PATH=...  SELF_TEST=1
 *   ROUTES=all  → every page reachable from the UI (plus /login logged out),
 *                 with real ids taken from the API
 * SELF_TEST=1 injects elements past both edges to prove detection works.
 *
 * Tables (every visible table.data on every page):
 *   - each value sits on the same side of its column as its header (measured
 *     from what is actually drawn, so RTL/LTR mix-ups show up)
 *   - every body row has as many columns as the header (no shifted rows)
 *   - phone card layout: no value or action is hidden or pushed off screen
 *   - no table that needs sideways scrolling (at any width, or only up to
 *     SCROLL_MAX_WIDTH=<px>), unless the wrapper is marked data-scroll-ok as
 *     an intentional, explained exception
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const USER = process.env.CHECK_USER;
const PASSWORD = process.env.CHECK_PASSWORD;
const WIDTHS = (process.env.WIDTHS ?? '1280,1024,390').split(',').map(Number);
const THEMES = (process.env.THEMES ?? 'light,dark').split(',');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SELF_TEST = process.env.SELF_TEST === '1';
// Tables must not need sideways scrolling at or below this width (default: any width).
const SCROLL_MAX_WIDTH = Number(process.env.SCROLL_MAX_WIDTH ?? 100000);
const PORT = 9400 + Math.floor(Math.random() * 400);

if (!USER || !PASSWORD) {
  console.error('Set CHECK_USER and CHECK_PASSWORD (a manager account sees every page).');
  process.exit(2);
}

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USER, password: PASSWORD }),
});
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!login.ok || !cookie) {
  console.error(`Login failed (${login.status}).`);
  process.exit(2);
}
const get = async (p) => (await (await fetch(`${API}${p}`, { headers: { Cookie: cookie } })).json()).data;

// Pages: dashboard, global pilgrims, the busiest delegate's detail page and
// that delegate's largest trip workspace.
const trips = (await get('/trips?pageSize=200')).items ?? [];
const busiest = [...trips].sort((a, b) => (b.pilgrimCount ?? 0) - (a.pilgrimCount ?? 0))[0];
const pages = [['dashboard', '/dashboard'], ['pilgrims', '/pilgrims']];
if (busiest) {
  const detail = await get(`/trips/${busiest.id}`);
  const assignment = [...(detail.delegates ?? [])].sort((a, b) => (b.pilgrimCount ?? 0) - (a.pilgrimCount ?? 0))[0];
  if (assignment) {
    pages.push(['delegate', `/delegates/${assignment.delegate.id}`]);
    pages.push(['workspace', `/delegates/${assignment.delegate.id}/trips/${busiest.id}/pilgrims`]);
  }
}
if (process.env.ROUTES === 'all') {
  const first = async (p) => (await get(p))?.items?.[0];
  const openTrip = trips.find((t) => t.status === 'OPEN') ?? trips[0];
  const doneTrip = trips.find((t) => t.status === 'COMPLETED');
  const pilgrim = await first('/pilgrims?pageSize=1');
  const cancelled = await first('/pilgrims?status=CANCELLED&pageSize=1');
  const account = await first('/finance/delegates?pageSize=1');
  const expense = await first('/expenses?pageSize=1');
  const add = (name, route) => route && pages.push([name, route]);
  add('trips', '/trips');
  add('trip-open', openTrip && `/trips/${openTrip.id}`);
  add('trip-completed', doneTrip && `/trips/${doneTrip.id}`);
  add('trips-new', '/trips?new=1');
  add('delegates', '/delegates');
  add('delegates-new', '/delegates?new=1');
  add('pilgrim', pilgrim && `/pilgrims/${pilgrim.id}`);
  add('pilgrim-cancelled', cancelled && `/pilgrims/${cancelled.id}`);
  add('pilgrim-new', '/pilgrims/new');
  add('pilgrim-edit', pilgrim && `/pilgrims/${pilgrim.id}/edit`);
  add('accounts', '/accounts');
  add('account', account && `/accounts/${account.id}`);
  add('account-payment', account && `/accounts/${account.id}/payments/new`);
  add('payments', '/payments');
  add('payment-new', '/payments/new');
  add('movements', '/finance/movements');
  add('adjustments', '/finance/adjustments');
  add('expenses', '/expenses');
  add('expense-new', '/expenses/new');
  add('expense', expense && `/expenses/${expense.id}`);
  for (const tab of ['missing', 'payments']) add(`reports-${tab}`, `/reports?tab=${tab}`);
  // Report tabs that need a selection before they show their table / preview.
  const busiestDetail = busiest ? await get(`/trips/${busiest.id}`) : null;
  const busiestDelegate = [...(busiestDetail?.delegates ?? [])].sort((a, b) => (b.pilgrimCount ?? 0) - (a.pilgrimCount ?? 0))[0];
  if (busiest) pages.push(['reports-trip', '/reports?tab=trip', { pick: [['الرحلة', busiest.id]] }]);
  if (busiest && busiestDelegate) {
    pages.push(['reports-delegate-trip', '/reports?tab=delegate-trip', { pick: [['الرحلة', busiest.id], ['المندوب', busiestDelegate.delegate.id]] }]);
  }
  if (account) pages.push(['reports-statement', '/reports?tab=statement', { pick: [['المندوب', account.id]] }]);
  add('users', '/users');
  add('audit', '/audit');
  add('profile', '/profile');
  pages.push(['login (logged out)', '/login', { loggedOut: true }]);
}
for (const extra of (process.env.EXTRA_PAGES ?? '').split(',').filter(Boolean)) pages.push([extra, extra]);

const profile = mkdtempSync(path.join(tmpdir(), 'rtl-check-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--lang=ar', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 60 && !target; i += 1) {
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
  } catch {
    await sleep(200);
  }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = (seq += 1);
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 25000);
    pending.set(id, (m) => {
      clearTimeout(timer);
      if (m.error) reject(new Error(`${method}: ${m.error.message}`));
      else resolve(m.result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

/** Runs in the page: elements past either edge, ignoring intentional clipping. */
const SCAN = `(() => {
  // Visible width excludes a classic vertical scrollbar (innerWidth includes it).
  const vw = document.documentElement.clientWidth;
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o !== 'visible') return true;
    }
    return false;
  };
  // A closed off-canvas drawer is a fixed panel parked entirely outside the
  // viewport on purpose; anything inside it is not visible. Fixed panels that
  // are on screen (e.g. an open modal) are still checked.
  const offCanvas = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).position === 'fixed') {
        const r = p.getBoundingClientRect();
        return r.left >= vw - 1 || r.right <= 1;
      }
    }
    return false;
  };
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (offCanvas(el)) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (clipped(el)) continue;
    const name = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
    out.push(name + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + '] ' + (el.textContent || '').trim().slice(0, 30));
    if (out.length >= 5) break;
  }
  return { scrollWidth: document.documentElement.scrollWidth, vw, elements: out };
})()`;

/** Runs in the page: header/value alignment, shifted rows, hidden card values. */
const TABLES = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
  };
  // Horizontal extent of what is actually drawn: text runs, icons/images, and
  // boxed items (badges, buttons) as whole boxes — their dot/padding would
  // otherwise make the text inside look off-side.
  const BOX = '.badge, .btn, button, input';
  const drawn = (cell) => {
    let l = Infinity;
    let r = -Infinity;
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let rects = [];
      if (n.nodeType === 3) {
        if (!n.textContent.trim() || n.parentElement.closest('select') || n.parentElement.closest(BOX)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        rects = [...range.getClientRects()];
      } else if (n.matches(BOX) && !n.parentElement.closest(BOX)) {
        rects = [n.getBoundingClientRect()];
      } else if (['svg', 'img'].includes(n.tagName.toLowerCase()) && !n.closest(BOX)) {
        rects = [n.getBoundingClientRect()];
      }
      for (const b of rects) {
        if (b.width === 0) continue;
        l = Math.min(l, b.left);
        r = Math.max(r, b.right);
      }
    }
    return l === Infinity ? null : { l, r };
  };
  // Which side of its cell the content sits on (null when it fills the cell).
  const side = (cell) => {
    const box = drawn(cell);
    if (!box) return null;
    const cs = getComputedStyle(cell);
    const cr = cell.getBoundingClientRect();
    const gl = box.l - (cr.left + parseFloat(cs.paddingLeft));
    const gr = cr.right - parseFloat(cs.paddingRight) - box.r;
    if (gl < 6 && gr < 6) return null;
    if (Math.abs(gl - gr) < 4) return 'center';
    return gr < gl ? 'right' : 'left';
  };
  document.querySelectorAll('table.data').forEach((table, index) => {
    if (!visible(table)) return;
    const name = (table.closest('.card')?.querySelector('.card-header h3, .card-header h2')?.textContent.trim() || (document.querySelector('.page-header h1')?.textContent.trim() ?? 'table') + ' #' + (index + 1)).slice(0, 40);
    const firstRow = table.querySelector('tbody tr');
    const headRow = table.querySelector('thead tr');
    const stacked = (firstRow && getComputedStyle(firstRow).display === 'block') || (headRow && !visible(headRow));
    if (stacked) {
      for (const cell of table.querySelectorAll('tbody td, tfoot td')) {
        if (!cell.textContent.trim() && !cell.querySelector('a, button, svg, img')) continue;
        const r = cell.getBoundingClientRect();
        if (!visible(cell) || r.left < -1 || r.right > vw + 1) {
          out.push(name + ': card value hidden or off screen «' + (cell.dataset.label || cell.textContent.trim().slice(0, 20)) + '»');
          break;
        }
      }
      return;
    }
    if (!headRow) return;
    const heads = [];
    for (const th of headRow.cells) for (let i = 0; i < th.colSpan; i += 1) heads.push(th.colSpan === 1 ? th : null);
    const mismatched = new Map();
    for (const row of table.querySelectorAll('tbody tr, tfoot tr')) {
      let span = 0;
      for (const cell of row.cells) span += cell.colSpan;
      if (row.cells.length > 1 && span !== heads.length) {
        out.push(name + ': a row has ' + span + ' columns under ' + heads.length + ' headers');
        break;
      }
      let col = 0;
      for (const cell of row.cells) {
        const th = cell.colSpan === 1 ? heads[col] : null;
        col += cell.colSpan;
        const label = th?.textContent.trim();
        if (!label) continue;
        const hs = side(th);
        const vs = side(cell);
        if (hs && vs && hs !== vs && !mismatched.has(label)) {
          mismatched.set(label, 'header ' + hs + ', value ' + vs + ' (e.g. «' + cell.textContent.trim().slice(0, 24) + '»)');
        }
      }
    }
    for (const [label, detail] of mismatched) out.push(name + ': «' + label + '» ' + detail);
  });
  if (vw <= ${SCROLL_MAX_WIDTH}) {
    for (const wrap of document.querySelectorAll('.table-wrap')) {
      if (!visible(wrap) || wrap.closest('[data-scroll-ok]')) continue;
      if (wrap.scrollWidth > wrap.clientWidth + 2) {
        const title = wrap.closest('.card')?.querySelector('.card-header h3')?.textContent.trim() ?? document.querySelector('.page-header h1')?.textContent.trim() ?? '?';
        out.push('table needs sideways scrolling: ' + title.slice(0, 40) + ' (+' + (wrap.scrollWidth - wrap.clientWidth) + 'px)');
      }
    }
  }
  return out;
})()`;

/** Picks a value in the (shared) select of the field labelled `label`. */
const pick = (label, value) => `(() => {
  const field = [...document.querySelectorAll('.field')].find((f) => f.querySelector('label')?.textContent.includes(${JSON.stringify(label)}));
  const select = field?.querySelector('select');
  if (!select || ![...select.options].some((o) => o.value === ${JSON.stringify(value)})) return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)});
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

const failures = [];
let checks = 0;
try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCookie', { name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: APP, httpOnly: true });
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      for (const [name, route, opts = {}] of pages) {
        if (opts.loggedOut) await send('Network.clearBrowserCookies');
        await send('Page.navigate', { url: `${APP}${route}` });
        await sleep(200);
        await evaluate(`localStorage.setItem('skytop-theme', '${theme}')`);
        await send('Page.navigate', { url: `${APP}${route}` });
        // Wait until the page header is rendered and no spinner/skeleton is left.
        const settle = async () => {
          for (let i = 0, stable = 0; i < 150 && stable < 6; i += 1) {
            const busy = await evaluate(`!document.querySelector('.page-header, .login-card') || !!document.querySelector('.spinner, .loading-row, .skeleton')`);
            stable = busy ? 0 : stable + 1;
            await sleep(60);
          }
        };
        await settle();
        for (const [label, value] of opts.pick ?? []) {
          let picked = false;
          for (let i = 0; i < 80 && !picked; i += 1) {
            picked = await evaluate(pick(label, value));
            if (!picked) await sleep(100);
          }
          await settle();
        }
        if (SELF_TEST) {
          await evaluate(`(() => { const page = document.querySelector('.page'); page.style.position = 'relative'; for (const side of ['left', 'right']) { const d = document.createElement('div'); d.textContent = 'self-test ' + side; d.style.cssText = 'position:absolute;top:0;width:300px;height:20px;' + side + ':-500px'; page.appendChild(d); } })()`);
        }
        const scan = await evaluate(SCAN);
        const metrics = await send('Page.getLayoutMetrics');
        const contentWidth = Math.round(metrics.cssContentSize?.width ?? metrics.contentSize.width);
        const problems = [];
        if (scan.scrollWidth > scan.vw + 1) problems.push(`document scrollWidth ${scan.scrollWidth} > ${scan.vw}`);
        if (contentWidth > scan.vw + 1) problems.push(`layout content width ${contentWidth} > ${scan.vw}`);
        if (scan.elements.length) problems.push(`elements outside the viewport: ${scan.elements.join(' | ')}`);
        if (!SELF_TEST) {
          const tables = await evaluate(TABLES);
          if (tables.length) problems.push(`tables: ${tables.join(' | ')}`);
        }
        checks += 1;
        if (opts.loggedOut) await send('Network.setCookie', { name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: APP, httpOnly: true });
        const label = `${name} @${width}px ${theme}`;
        if (problems.length) failures.push(`${label}: ${problems.join('; ')}`);
        console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${label}${problems.length ? `  — ${problems.join('; ')}` : ''}`);
      }
    }
  }
} finally {
  ws.close();
  chrome.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // temporary profile; the OS cleans the temp folder
  }
}

if (SELF_TEST) {
  // Every page with injected off-screen elements must be flagged.
  const ok = checks > 0 && failures.length === checks;
  console.log(ok ? `\nself-test OK: overflow detected on both sides in ${checks}/${checks} checks` : '\nself-test FAILED: some overflow was not detected');
  process.exit(ok ? 0 : 1);
}
console.log(`\n${checks - failures.length}/${checks} checks passed`);
process.exit(failures.length ? 1 : 0);
