#!/usr/bin/env node
/**
 * UI smoke checks (dev/QA tool, no dependencies) against a running stack:
 *   - theme: a fresh browser opens DARK (also on the first frame), a saved
 *     light / dark choice survives reloads
 *   - shared select: menu visible and inside the viewport, keyboard works,
 *     long lists are searchable (Arabic), opens upward near the bottom,
 *     stays above modals and Escape closes only the menu
 *   - phone: pilgrim-card actions are inside the screen with usable targets
 *   - clickable rows / cards: clicking empty space (or Enter on the focused
 *     row) opens the detail page; actions inside a row do not navigate;
 *     list context survives (pilgrim → «رجوع» returns to the filtered list)
 *   - dialogs: sensitive actions use the shared ConfirmDialog (no native
 *     alert / confirm / prompt), focus starts on «رجوع», Tab stays inside,
 *     Escape closes and focus returns. Never confirms — read-only.
 *   - phone: account status tabs fully visible; account card opens the account
 *   - financial pages show Western digits only
 *
 * Usage:
 *   APP_URL=http://localhost:5173 API_URL=http://localhost:4000/api/v1 \
 *   CHECK_USER=<manager username> CHECK_PASSWORD=<password> npm run check:ui
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const USER = process.env.CHECK_USER;
const PASSWORD = process.env.CHECK_PASSWORD;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9800 + Math.floor(Math.random() * 150);
if (!USER || !PASSWORD) {
  console.error('Set CHECK_USER and CHECK_PASSWORD.');
  process.exit(2);
}
const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PASSWORD }) });
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!login.ok || !cookie) {
  console.error(`Login failed (${login.status}).`);
  process.exit(2);
}
const get = async (p) => (await (await fetch(`${API}${p}`, { headers: { Cookie: cookie } })).json()).data;

const results = [];
let failures = 0;
const check = (name, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  — ${extra}` : ''}`);
  if (!ok) failures += 1;
};

const profile = mkdtempSync(path.join(tmpdir(), 'ui-smoke-'));
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
const waitFor = async (expression, timeout = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(80);
  }
  throw new Error(`timeout: ${expression.slice(0, 120)}`);
};
/** modifiers: 8 = Shift (CDP bit flags). */
const key = async (k, code = k, modifiers = 0) => {
  const windowsVirtualKeyCode = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27, Tab: 9, ' ': 32 }[k] ?? 0;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, windowsVirtualKeyCode });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers, windowsVirtualKeyCode });
};
const size = (width, height = 900) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
const setCookie = () => send('Network.setCookie', { name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: APP, httpOnly: true });
/** In-page: the open menu's box, fully inside the viewport? */
const MENU = `(() => { const m = document.querySelector('.select-menu'); if (!m) return null; const r = m.getBoundingClientRect(); const vw = document.documentElement.clientWidth; return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, inside: r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= window.innerHeight, up: m.classList.contains('is-up'), z: Number(getComputedStyle(m).zIndex), search: !!m.querySelector('.select-search input'), options: m.querySelectorAll('[role=option]').length }; })()`;

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  // Record the theme on the very first frame of every navigation.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `document.addEventListener('DOMContentLoaded', () => { window.__firstTheme = document.documentElement.dataset.theme; window.__firstBg = getComputedStyle(document.documentElement).backgroundColor; });`,
  });
  await setCookie();
  await size(1280);

  // ---------------- theme
  await send('Page.navigate', { url: `${APP}/login` });
  await waitFor(`document.readyState === 'complete'`);
  await evaluate(`localStorage.removeItem('skytop-theme')`);
  await send('Page.navigate', { url: `${APP}/dashboard` });
  await waitFor(`!!document.querySelector('.page-header')`);
  const fresh = await evaluate(`({ theme: document.documentElement.dataset.theme, first: window.__firstTheme, firstBg: window.__firstBg, stored: localStorage.getItem('skytop-theme') })`);
  check('theme: fresh browser opens dark (first frame too, nothing stored)', fresh.theme === 'dark' && fresh.first === 'dark' && fresh.stored === null && fresh.firstBg !== 'rgb(255, 255, 255)', JSON.stringify(fresh));
  await evaluate(`document.querySelector('[aria-label*="الوضع"], .theme-toggle, button[title*="الوضع"]')?.click()`);
  await sleep(200);
  // Page.reload returns before navigation: mark the old document and wait until it is gone.
  const reload = async () => {
    await evaluate('window.__oldDocument = true');
    await send('Page.reload');
    await waitFor(`!window.__oldDocument && !!document.querySelector('.page-header')`);
  };
  const afterToggle = await evaluate(`({ theme: document.documentElement.dataset.theme, stored: localStorage.getItem('skytop-theme') })`);
  check('theme: toggle switches to light and saves it', afterToggle.theme === 'light' && afterToggle.stored === 'light', JSON.stringify(afterToggle));
  await reload();
  const afterReload = await evaluate(`document.documentElement.dataset.theme + '/' + window.__firstTheme`);
  check('theme: light survives reload (first frame light)', afterReload === 'light/light', afterReload);
  await evaluate(`document.querySelector('[aria-label*="الوضع"], .theme-toggle, button[title*="الوضع"]')?.click()`);
  await sleep(200);
  await reload();
  check('theme: dark choice survives reload', (await evaluate(`document.documentElement.dataset.theme + '/' + localStorage.getItem('skytop-theme')`)) === 'dark/dark');

  // ---------------- select: filter on the pilgrims page (long list → search)
  await send('Page.navigate', { url: `${APP}/pilgrims` });
  await waitFor(`document.querySelectorAll('.select-trigger').length >= 3 && document.querySelectorAll('table.data tbody tr').length > 0`);
  const triggerSel = `[...document.querySelectorAll('.field')].find(f => f.querySelector('label')?.textContent.includes('الرحلة')).querySelector('.select-trigger')`;
  check('select: no native select is visible or clickable', await evaluate(`[...document.querySelectorAll('select')].every(s => { const cs = getComputedStyle(s); return cs.opacity === '0' && cs.pointerEvents === 'none' && s.getBoundingClientRect().width <= 2; })`));
  check('select: combobox is labelled by its field', await evaluate(`(() => { const t = ${triggerSel}; return t.getAttribute('role') === 'combobox' && document.getElementById(t.getAttribute('aria-labelledby'))?.textContent.includes('الرحلة'); })()`));
  await evaluate(`${triggerSel}.click()`);
  await waitFor(`!!document.querySelector('.select-menu')`);
  const menu = await evaluate(MENU);
  check('select: menu opens fully inside the viewport, with search for a long list', menu && menu.inside && menu.search && menu.options > 10, JSON.stringify(menu));
  const trips = (await get('/pilgrims/filter-options')).trips;
  const sample = trips.find((t) => /رمضان/.test(t.name)) ?? trips[0];
  // Arabic-friendly search: alef/ta-marbuta variants still match.
  const typed = sample.name.replace(/ة/g, 'ه').replace(/[أإآ]/g, 'ا');
  await evaluate(`(() => { const i = document.querySelector('.select-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(typed)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(150);
  const filtered = await evaluate(`[...document.querySelectorAll('.select-menu [role=option]')].map(o => o.textContent)`);
  check('select: Arabic search matches spelling variants', filtered.length >= 1 && filtered.every((t) => t.includes(sample.name)), `${typed} → ${filtered.length}`);
  await key('ArrowDown');
  await key('Enter');
  await waitFor(`!document.querySelector('.select-menu')`);
  const applied = await waitFor(`location.search.includes('tripId=${sample.id}') && ${triggerSel}.textContent.includes(${JSON.stringify(sample.name)})`, 5000).catch(() => false);
  check('select: keyboard Enter selects → filter applied (URL + trigger)', applied, await evaluate(`location.search + ' | ' + ${triggerSel}.textContent`));
  check('select: focus returns to the control after selecting', await evaluate(`document.activeElement === ${triggerSel}`));

  // Upward placement near the bottom of the screen.
  await size(1280, 420);
  await evaluate(`(() => { const t = ${triggerSel}; window.scrollTo(0, window.scrollY + t.getBoundingClientRect().top - (window.innerHeight - 60)); })()`);
  await sleep(200);
  await evaluate(`${triggerSel}.click()`);
  await waitFor(`!!document.querySelector('.select-menu')`);
  const upMenu = await evaluate(MENU);
  check('select: opens upward when there is no room below', upMenu && upMenu.up && upMenu.inside, JSON.stringify(upMenu));
  await key('Escape');
  await waitFor(`!document.querySelector('.select-menu')`);
  await size(1280);

  // ---------------- select inside a modal (transfer)
  const tripsList = (await get('/trips?status=OPEN&pageSize=50')).items;
  const busy = tripsList.sort((a, b) => b.pilgrimCount - a.pilgrimCount)[0];
  const assignment = (await get(`/trips/${busy.id}`)).delegates.sort((a, b) => b.pilgrimCount - a.pilgrimCount)[0];
  await send('Page.navigate', { url: `${APP}/delegates/${assignment.delegate.id}/trips/${busy.id}/pilgrims` });
  await waitFor(`document.querySelectorAll('table.data tbody tr').length > 0`);
  await evaluate(`document.querySelector('table.data tbody tr [aria-label="نقل إلى رحلة أخرى"]').click()`);
  await waitFor(`!!document.querySelector('.modal .select-trigger:not(:disabled)')`);
  await evaluate(`document.querySelector('.modal .select-trigger').click()`);
  await waitFor(`!!document.querySelector('.select-menu')`);
  const modalMenu = await evaluate(`(() => { const m = ${MENU}; const modalZ = Number(getComputedStyle(document.querySelector('.modal-backdrop')).zIndex); const r = document.querySelector('.select-menu').getBoundingClientRect(); const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + 10); return { ...m, modalZ, onTop: !!topEl?.closest('.select-menu') }; })()`);
  check('select: inside a modal the menu is on top and not clipped', modalMenu && modalMenu.inside && modalMenu.onTop && modalMenu.z > modalMenu.modalZ, JSON.stringify(modalMenu));
  await key('Escape');
  await sleep(150);
  check('select: Escape closes only the menu (modal stays open)', await evaluate(`!document.querySelector('.select-menu') && !!document.querySelector('.modal')`));
  await key('Escape');

  // ---------------- phone: actions reachable
  await size(390, 844);
  for (const [name, route] of [['global list', '/pilgrims'], ['workspace', `/delegates/${assignment.delegate.id}/trips/${busy.id}/pilgrims`]]) {
    await send('Page.navigate', { url: `${APP}${route}` });
    await waitFor(`document.querySelectorAll('.pilgrim-card').length > 0`);
    const phone = await evaluate(`(() => { const vw = document.documentElement.clientWidth; const btns = [...document.querySelectorAll('.pilgrim-card .btn')]; return { count: btns.length, inside: btns.every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= vw; }), targets: btns.every(b => b.getBoundingClientRect().height >= 30) }; })()`);
    check(`phone ${name}: card actions inside the screen, usable size`, phone.count > 0 && phone.inside && phone.targets, JSON.stringify(phone));
  }

  // ---------------- clickable rows / cards and child actions
  await size(1280, 900);
  // Record any native dialog call (none must happen).
  const NATIVE_TRAP = `(() => { window.__native = []; for (const n of ['alert', 'confirm', 'prompt']) window[n] = (...a) => { window.__native.push(n); return false; }; })()`;
  await send('Page.navigate', { url: `${APP}/trips` });
  await waitFor(`document.querySelectorAll('table.data tbody tr.row-link').length > 0`);
  const tripHref = await evaluate(`document.querySelector('table.data tbody tr.row-link').dataset.href`);
  // Click a plain cell (the departure date), not the name link.
  await evaluate(`document.querySelector('table.data tbody tr.row-link').cells[1].click()`);
  check('rows: clicking empty space in a trip row opens the trip', await waitFor(`location.pathname === ${JSON.stringify(tripHref)}`, 8000), await evaluate('location.pathname'));
  await send('Page.navigate', { url: `${APP}/trips` });
  await waitFor(`document.querySelectorAll('table.data tbody tr.row-link').length > 0`);
  // Reach the row from its own link with Shift+Tab (keyboard focus → :focus-visible).
  await evaluate(`document.querySelector('table.data tbody tr.row-link a').focus()`);
  await key('Tab', 'Tab', 8);
  const focusRing = await evaluate(`document.activeElement.matches('tr.row-link') ? getComputedStyle(document.activeElement).outlineStyle : 'not-on-row'`);
  await key('Enter');
  check('rows: Enter on a focused row opens it (with a visible focus ring)', (await waitFor(`location.pathname === ${JSON.stringify(tripHref)}`, 8000)) && focusRing === 'solid', focusRing);
  await send('Page.navigate', { url: `${APP}/trips` });
  await waitFor(`document.querySelectorAll('table.data tbody tr.row-link').length > 0`);
  await evaluate(`(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; document.querySelector('table.data tbody tr.row-link').cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); })()`);
  check('rows: Ctrl+click opens the detail in a new tab and stays on the list', (await evaluate(`location.pathname === '/trips' && window.__opened[0] === ${JSON.stringify(tripHref)}`)));

  await send('Page.navigate', { url: `${APP}/delegates` });
  await waitFor(`[...document.querySelectorAll('table.data tbody tr.row-link button')].some((b) => /^(إيقاف|تفعيل)$/.test(b.textContent.trim()))`);
  await evaluate(NATIVE_TRAP);
  // Prefer a destructive action (إيقاف) so the safe-focus rule is exercised.
  await evaluate(`(() => { const all = [...document.querySelectorAll('table.data tbody tr.row-link button')]; (all.find((b) => b.textContent.trim() === 'إيقاف') ?? all.find((b) => b.textContent.trim() === 'تفعيل')).setAttribute('data-trigger', '1'); })()`);
  await evaluate(`document.querySelector('[data-trigger]').focus(); document.querySelector('[data-trigger]').click()`);
  const dialogOpen = await waitFor(`!!document.querySelector('.modal[role=dialog]')`, 5000);
  check('actions: a row button runs its own action (dialog) without navigating', dialogOpen && (await evaluate(`location.pathname === '/delegates'`)));
  const dlg = await evaluate(`(() => { const d = document.querySelector('.modal[role=dialog]'); const t = document.getElementById(d.getAttribute('aria-labelledby')); return { modal: d.getAttribute('aria-modal'), title: t?.textContent, focus: document.activeElement?.textContent.trim(), buttons: [...d.querySelectorAll('.modal-footer button')].map((b) => b.textContent.trim()), native: window.__native.length }; })()`);
  check('dialog: shared ConfirmDialog (aria-modal, titled, Arabic actions), no native dialog', dlg.modal === 'true' && /المندوب/.test(dlg.title ?? '') && dlg.buttons[0] === 'رجوع' && /المندوب$/.test(dlg.buttons[1] ?? '') && dlg.native === 0, JSON.stringify(dlg));
  check('dialog: destructive confirmation (إيقاف) starts on «رجوع»', /إيقاف/.test(dlg.title ?? '') && dlg.focus === 'رجوع', `${dlg.title} / ${dlg.focus}`);
  const tabbed = [];
  for (let i = 0; i < 6; i += 1) {
    await key('Tab');
    tabbed.push(await evaluate(`document.querySelector('.modal').contains(document.activeElement) ? (document.activeElement.textContent.trim() || document.activeElement.getAttribute('aria-label')) : 'OUTSIDE'`));
  }
  check('dialog: Tab cycles through the dialog controls and never leaves it', !tabbed.includes('OUTSIDE') && new Set(tabbed).size >= 2, tabbed.join(' → '));
  await key('Escape');
  check('dialog: Escape closes it and focus returns to the button', (await waitFor(`!document.querySelector('.modal')`, 3000)) && (await evaluate(`document.activeElement === document.querySelector('[data-trigger]')`)));

  // List context: global pilgrims (filtered) → card/row → «رجوع» returns to the same list.
  await send('Page.navigate', { url: `${APP}/pilgrims?status=ACTIVE&page=2` });
  await waitFor(`document.querySelectorAll('table.data tbody tr.row-link').length > 0`);
  await evaluate(`document.querySelector('table.data tbody tr.row-link').cells[2].click()`);
  await waitFor(`/^\\/pilgrims\\/[0-9a-f-]+$/.test(location.pathname) && [...document.querySelectorAll('button')].some((b) => b.textContent.includes('رجوع لقائمة المعتمرين'))`, 10000);
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('رجوع لقائمة المعتمرين')).click()`);
  check('rows: pilgrim opened from a filtered list returns to that list', await waitFor(`location.pathname + location.search === '/pilgrims?status=ACTIVE&page=2'`, 8000), await evaluate('location.pathname + location.search'));

  // ---------------- phone: account tabs and cards
  await size(360, 800);
  await send('Page.navigate', { url: `${APP}/accounts` });
  await waitFor(`document.querySelectorAll('.account-card').length > 0`);
  const tabs = await evaluate(`(() => { const vw = document.documentElement.clientWidth; const t = [...document.querySelectorAll('.filter-tabs .tab')]; return { count: t.length, inside: t.every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= vw && r.width > 0; }) }; })()`);
  check('phone (360): all four account tabs fully visible', tabs.count === 4 && tabs.inside, JSON.stringify(tabs));
  const cardHref = await evaluate(`document.querySelector('.account-card').dataset.href`);
  await evaluate(`document.querySelector('.account-card .account-card-figures').click()`);
  check('phone: tapping an account card opens the account', await waitFor(`location.pathname === ${JSON.stringify(cardHref)}`, 8000), await evaluate('location.pathname'));

  // ---------------- Western digits on financial pages
  await size(1280, 900);
  for (const route of ['/dashboard', '/accounts', '/payments', '/finance/movements', '/expenses', cardHref]) {
    await send('Page.navigate', { url: `${APP}${route}` });
    await waitFor(`!!document.querySelector('.page-header') && !document.querySelector('.spinner, .skeleton, .loading-row')`);
    await sleep(300);
    check(`digits: ${route} shows Western digits only`, await evaluate(`!/[٠-٩۰-۹]/.test(document.querySelector('.main').innerText)`));
  }
} catch (error) {
  check('run', false, error.message);
} finally {
  ws.close();
  chrome.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // temporary profile
  }
}
console.log(results.join('\n'));
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
