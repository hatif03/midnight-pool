#!/usr/bin/env node
/**
 * End-to-end probe before submission.
 *
 * Covers: unit tests, relay tests, Compact simulator tests (if deps exist),
 * live Preview indexer/RPC, Cloud Run prover CORS + relay WS, local/prod HTTP
 * APIs, HTML markers, and a real Chrome pass of the lobby/Hall/Settings/solo
 * table. Does NOT drive Lace or WebAuthn — those are native prompts.
 *
 *   npm run e2e
 *   node scripts/e2e.mjs --skip-unit --skip-contracts --skip-build
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT = '749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3';
const INDEXER = 'https://indexer.preview.midnight.network/api/v4/graphql';
const RPC = 'https://rpc.preview.midnight.network';
const PROVER = 'https://midnight-pool-prover-147606977567.us-central1.run.app';
const RELAY = 'wss://midnight-pool-relay-147606977567.us-central1.run.app';
const PROD = 'https://midnight-pool-one.vercel.app';
const LOCAL = process.env.E2E_BASE || 'http://localhost:5173';
const ORIGIN = 'https://midnight-pool-one.vercel.app';

const args = new Set(process.argv.slice(2));
const skipUnit = args.has('--skip-unit');
const skipContracts = args.has('--skip-contracts');
const skipBuild = args.has('--skip-build');
const skipBrowser = args.has('--skip-browser');

const results = [];
const fail = (name, detail) => { results.push({ name, ok: false, detail }); };
const pass = (name, detail = '') => { results.push({ name, ok: true, detail }); };
const warn = (name, detail) => { results.push({ name, ok: 'warn', detail }); };

function run(cmd, cwd, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      cwd, shell: true, env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out: out.trim() }));
  });
}

async function fetchJson(url, opts = {}, timeoutMs = 20_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { ok: res.ok, status: res.status, text, json, headers: res.headers };
  } finally {
    clearTimeout(t);
  }
}

const HALL_QUERY = JSON.stringify({
  query: 'query($a:HexEncoded!){ contractAction(address:$a){ __typename address } }',
  variables: { a: CONTRACT },
});

const MARKERS = [
  'btn-hall', 'hall-modal', 'btn-mn-continue', 'btn-mn-connect',
  'mn-recovery-pin', 'btn-mn-recovery-export', 'btn-mn-deploy-show',
  'btn-mn-audit', 'btn-mn-champion', 'ranked-toggle', 'screen-main',
  'btn-solo', 'btn-quick', 'btn-multi',
];

async function probeIndexer(label, url) {
  const r = await fetchJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: HALL_QUERY,
  });
  const action = r.json?.data?.contractAction;
  if (r.ok && action?.__typename && String(action.address || '').includes(CONTRACT.slice(0, 16))) {
    pass(label, `${action.__typename} @ ${String(action.address).slice(0, 16)}…`);
  } else {
    fail(label, `status ${r.status}: ${r.text.slice(0, 240)}`);
  }
}

async function probeHtml(label, url) {
  const r = await fetchJson(url, {}, 25_000);
  if (!r.ok) {
    fail(label, `HTTP ${r.status}`);
    return { html: r.text, missing: MARKERS, ok: false };
  }
  const missing = MARKERS.filter((id) => !r.text.includes(id));
  if (missing.length) {
    fail(label, `Wave 1 UI not on this origin (missing ${missing.join(', ')}). Push this branch and vercel --prod before submit.`);
  } else {
    pass(label, `${r.text.length} bytes, all Wave 1 markers`);
  }
  return { html: r.text, missing, ok: missing.length === 0 };
}

async function probeTable(base, label) {
  const id = 'e'.repeat(64);
  const blob = `e2e-${Date.now()}`;
  const put = await fetchJson(`${base}/api/table`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, blob, updatedAt: Date.now() }),
  });
  if (!put.ok) {
    fail(`${label} PUT`, `HTTP ${put.status} — Wave 1 /api/table is not on this origin yet`);
    return;
  }
  const get = await fetchJson(`${base}/api/table?id=${id}`);
  if (get.ok && get.json?.blob === blob) pass(`${label} round-trip`, 'ciphertext stored and returned');
  else warn(`${label} GET after PUT`, `HTTP ${get.status} — in-memory store is not durable across instances (set KV_REST_API_*)`);
}

async function liveServices() {
  await probeIndexer('Preview indexer GraphQL', INDEXER);

  const rpc = await fetchJson(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'system_chain', params: [] }),
  });
  const chain = rpc.json?.result;
  if (rpc.ok && typeof chain === 'string' && /preview/i.test(chain)) pass('Preview RPC system_chain', chain);
  else fail('Preview RPC system_chain', `status ${rpc.status}: ${rpc.text.slice(0, 200)}`);

  const cors = await fetchJson(`${PROVER}/prove`, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  }, 25_000);
  const acao = cors.headers.get('access-control-allow-origin') || '';
  if (acao === ORIGIN || acao === '*') pass('Cloud Run prover CORS', `OPTIONS /prove → ${acao}`);
  else warn('Cloud Run prover CORS', `status ${cors.status} acao=${acao || '(none)'}`);

  try {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(RELAY);
      const t = setTimeout(() => { try { ws.close(); } catch { /* */ } reject(new Error('timeout')); }, 12_000);
      ws.addEventListener('open', () => { clearTimeout(t); ws.close(); resolve(); });
      ws.addEventListener('error', (e) => { clearTimeout(t); reject(e.error || new Error('ws error')); });
    });
    pass('Matchmaking relay WS', RELAY);
  } catch (err) {
    fail('Matchmaking relay WS', String(err?.message || err));
  }

  const prodHtml = await probeHtml('Production HTML markers', PROD);
  if (prodHtml.ok) {
    await probeIndexer('Production /api/ledger', `${PROD}/api/ledger`);
    await probeTable(PROD, 'Production /api/table');
  } else {
    warn('Production /api/ledger', 'Vercel is not this Wave 1 build — Hall proxy 404s until vercel --prod');
    warn('Production /api/table', 'same — Continue blob API is not live until this branch is deployed');
  }
  return prodHtml.ok;
}

async function localServices() {
  let up = false;
  try {
    const r = await fetchJson(LOCAL, {}, 4000);
    up = r.status > 0 && r.status < 500;
  } catch { up = false; }
  if (!up) {
    warn('Local Vite', `${LOCAL} not running — skipped local Hall/table/UI. Start npm run dev.`);
    return false;
  }
  pass('Local Vite', LOCAL);
  await probeHtml('Local HTML markers', LOCAL);
  await probeIndexer('Local /api/ledger', `${LOCAL}/api/ledger`);
  await probeTable(LOCAL, 'Local /api/table');
  return true;
}

async function unitTests() {
  if (skipUnit) { warn('Client unit tests', 'skipped'); warn('Relay tests', 'skipped'); return; }
  const client = await run('npm test', ROOT);
  if (client.code === 0) pass('Client unit tests', 'physics, rules, economy, cues, midnight helpers, tableCrypto');
  else fail('Client unit tests', client.out.slice(-400));

  const server = await run('npm test', path.join(ROOT, 'server'));
  if (server.code === 0) pass('Relay + attestation tests', 'matchmaker + HMAC receipts');
  else fail('Relay + attestation tests', server.out.slice(-400));
}

async function contractTests() {
  if (skipContracts) { warn('Compact simulator tests', 'skipped'); return; }
  const dir = path.join(ROOT, 'contracts');
  const hasDeps = (() => {
    try { require(path.join(dir, 'node_modules', 'tsx', 'package.json')); return true; } catch { return false; }
  })();
  if (!hasDeps) {
    const inst = await run('npm install', dir);
    if (inst.code !== 0) {
      fail('contracts npm install', inst.out.replace(/\s+/g, ' ').slice(-280));
      return;
    }
  }
  const t = await run('npm test', dir);
  if (t.code === 0) pass('Compact simulator tests', 'midnight-pool.compact + stakes.compact');
  else {
    const compact = t.out.match(/CompactError:[^\n]+/)?.[0] || t.out.replace(/\s+/g, ' ').slice(-280);
    fail('Compact simulator tests', compact);
  }
}

async function productionBuild() {
  if (skipBuild) { warn('vite build', 'skipped'); return; }
  const b = await run('npm run build', ROOT);
  if (b.code === 0) pass('vite build', 'production bundle');
  else fail('vite build', b.out.slice(-500));
}

async function browserPass(base, tag) {
  if (skipBrowser) { warn(`Browser ${tag}`, 'skipped'); return; }
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    fail(`Browser ${tag}`, 'playwright not installed (npm i -D playwright)');
    return;
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const shots = path.join(ROOT, 'docs', 'e2e');
  await mkdir(shots, { recursive: true });

  try {
    const page = await browser.newPage({ viewport: { width: 896, height: 414 }, isMobile: false });
    page.setDefaultTimeout(20_000);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app canvas', { timeout: 45_000 });
    await page.waitForSelector('#screen-main');

    const rotate = await page.locator('#rotate-overlay').evaluate((el) => getComputedStyle(el).display);
    if (rotate === 'none') pass(`${tag} landscape lobby`, 'rotate overlay hidden');
    else fail(`${tag} landscape lobby`, `rotate overlay display=${rotate}`);

    await page.screenshot({ path: path.join(shots, `${tag}-lobby.png`) });
    if (tag === 'local') {
      await page.screenshot({ path: path.join(ROOT, 'docs', 'screenshot.png') });
    }

    await page.click('#btn-hall');
    await page.waitForSelector('#hall-modal.show');
    await page.waitForFunction(() => {
      const s = document.getElementById('hall-status')?.textContent || '';
      return /Live:|Vivo:|Could not|No se pudo/i.test(s);
    });
    const hallStatus = (await page.locator('#hall-status').textContent()) || '';
    const hallBody = (await page.locator('#hall-body').innerText()) || '';
    if (/live|ContractCall|ContractAction/i.test(hallStatus) && hallBody.includes(CONTRACT.slice(0, 12))) {
      pass(`${tag} The Hall`, hallStatus.trim());
    } else {
      fail(`${tag} The Hall`, `status="${hallStatus}" body=${hallBody.slice(0, 180)}`);
    }
    await page.screenshot({ path: path.join(shots, `${tag}-hall.png`) });
    await page.click('#hall-modal [data-close="hall-modal"]');

    await page.click('#btn-settings');
    await page.waitForSelector('#settings-modal.show');
    const hint = (await page.locator('#mn-wallet-hint').textContent()) || '';
    if (/Lace|1AM|Safari/i.test(hint)) pass(`${tag} wallet hint`, hint.slice(0, 120));
    else fail(`${tag} wallet hint`, hint || '(empty)');

    for (const id of ['btn-mn-continue', 'btn-mn-connect', 'mn-recovery-pin', 'btn-mn-recovery-export']) {
      if (await page.locator(`#${id}`).count()) pass(`${tag} #${id}`, 'present');
      else fail(`${tag} #${id}`, 'missing');
    }

    await page.click('#lang-seg [data-lang="es"]');
    await page.waitForTimeout(200);
    const es = (await page.locator('#btn-mn-continue').textContent()) || '';
    await page.click('#lang-seg [data-lang="en"]');
    await page.waitForTimeout(200);
    const en = (await page.locator('#btn-mn-continue').textContent()) || '';
    if (/continuar|continue/i.test(es) && /continue/i.test(en)) pass(`${tag} i18n ES/EN`, `"${es.trim()}" / "${en.trim()}"`);
    else warn(`${tag} i18n ES/EN`, `"${es}" / "${en}"`);

    await page.click('#btn-mn-champion');
    await page.waitForSelector('#champion-modal.show');
    const champ = (await page.locator('#champion-modal').innerText()) || '';
    if (/no chain submission yet/i.test(champ)) fail(`${tag} Champion copy`, 'still claims no chain submission');
    else pass(`${tag} Champion copy`, 'does not claim chain is unwired');
    await page.click('#champion-modal [data-close="champion-modal"]');
    await page.click('#settings-modal [data-close="settings-modal"]');

    for (const [btn, modal] of [
      ['#btn-leagues', '#leagues-modal'],
      ['#btn-cues', '#cues-modal'],
      ['#btn-pass', '#pass-modal'],
      ['#btn-shop', '#shop-modal'],
      ['#btn-daily', '#daily-modal'],
    ]) {
      await page.click(btn);
      await page.waitForSelector(`${modal}.show`);
      pass(`${tag} ${modal}`, 'opens');
      await page.click(`${modal} [data-close="${modal.slice(1)}"]`);
      await page.waitForTimeout(120);
    }

    await page.click('#btn-multi');
    await page.waitForSelector('#screen-mp.active');
    if (await page.locator('#btn-create').isVisible()) pass(`${tag} multiplayer screen`, 'create/join');
    else fail(`${tag} multiplayer screen`, 'create not visible');
    await page.click('#screen-mp [data-back="screen-main"]');
    await page.waitForSelector('#screen-main.active');

    await page.click('#btn-solo');
    await page.waitForFunction(() => document.getElementById('menu')?.classList.contains('hidden'));
    const canvas = await page.locator('#app canvas').count();
    if (canvas >= 1) pass(`${tag} solo table`, `${canvas} canvas`);
    else fail(`${tag} solo table`, 'no Pixi canvas');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(shots, `${tag}-solo.png`) });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(base, { waitUntil: 'domcontentloaded' });
    await mobile.waitForSelector('#rotate-overlay');
    const shown = await mobile.locator('#rotate-overlay').evaluate((el) => getComputedStyle(el).display !== 'none');
    if (shown) pass(`${tag} portrait overlay`, 'asks to rotate');
    else fail(`${tag} portrait overlay`, 'overlay not shown');
    await mobile.screenshot({ path: path.join(shots, `${tag}-portrait.png`) });
    await mobile.close();
  } catch (err) {
    fail(`Browser ${tag}`, String(err?.message || err));
  } finally {
    await browser.close();
  }
}

async function writeReport() {
  const lines = results.map((r) => {
    const mark = r.ok === true ? 'PASS' : r.ok === 'warn' ? 'WARN' : 'FAIL';
    return `- **${mark}** ${r.name}${r.detail ? ` — ${r.detail}` : ''}`;
  });
  const failed = results.filter((r) => r.ok === false).length;
  const warned = results.filter((r) => r.ok === 'warn').length;
  const passed = results.filter((r) => r.ok === true).length;
  const md = `# E2E report

Generated ${new Date().toISOString()}

${passed} passed / ${warned} warnings / ${failed} failed

${lines.join('\n')}

Lace connect, Face ID / WebAuthn Continue, tDUST faucet, and a live two-wallet Rack
submit are **manual**. This probe never clicks those prompts.

Lobby screenshot: docs/screenshot.png. Other captures: docs/e2e/.
`;
  await writeFile(path.join(ROOT, 'docs', 'E2E.md'), md);
}

console.log('Midnight Pool E2E\n');
await unitTests();
await contractTests();
const prodWave1 = await liveServices();
const localUp = await localServices();
if (localUp) await browserPass(LOCAL, 'local');
else warn('Browser local', 'dev server down');
if (prodWave1) await browserPass(PROD, 'prod');
else warn('Browser prod', 'skipped — production is not this Wave 1 build. Push + vercel --prod.');
await productionBuild();
await writeReport();

const failed = results.filter((r) => r.ok === false);
const warned = results.filter((r) => r.ok === 'warn');
for (const r of results) {
  const mark = r.ok === true ? 'PASS' : r.ok === 'warn' ? 'WARN' : 'FAIL';
  console.log(`${mark.padEnd(4)} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(`\n${results.filter((r) => r.ok === true).length} passed, ${warned.length} warnings, ${failed.length} failed`);
console.log('Wrote docs/E2E.md' + (localUp ? ' and docs/screenshot.png' : ''));
process.exit(failed.length ? 1 : 0);
