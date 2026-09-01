#!/usr/bin/env node
/**
 * 全画面・全APIの疎通と、ログイン保護がかかっていることの確認。
 * Next.js のバージョンを上げた後に必ず流す。
 *   node scripts/test-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const env = {};
for (const l of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim();
}
const COOKIE = `ec_shitsuji_session=${crypto.createHmac('sha256', env.SESSION_SECRET ?? 'fallback').update(env.AUTH_PASSWORD ?? '').digest('hex')}`;
let ok = 0, ng = 0;
const c = (n, v, d = '') => { if (v) { ok++; console.log(`  OK   ${n}`); } else { ng++; console.log(`  NG   ${n}${d ? `  → ${d}` : ''}`); } };

const PROTECTED_PAGES = ['/dashboard', '/orders', '/orders/new', '/customers', '/audit'];
const PROTECTED_APIS = ['/api/orders', '/api/customers', '/api/customers/logins', '/api/audit'];

console.log('\n【ログイン保護】未ログインでは入れないこと');
for (const p of [...PROTECTED_PAGES, ...PROTECTED_APIS]) {
  const r = await fetch(`${BASE}${p}`, { redirect: 'manual' });
  c(`${p.padEnd(26)} 未ログインで弾かれる`, r.status >= 300 && r.status < 400, `HTTP ${r.status}`);
}
const top = await fetch(`${BASE}/`, { redirect: 'manual' });
c('/                          ログイン画面は誰でも見られる', top.status === 200, `HTTP ${top.status}`);

console.log('\n【画面】ログイン後に表示されること');
for (const p of PROTECTED_PAGES) {
  const r = await fetch(`${BASE}${p}`, { headers: { Cookie: COOKIE } });
  const html = await r.text();
  c(`${p.padEnd(26)} 表示される`, r.status === 200 && html.includes('EC執事'), `HTTP ${r.status}`);
}

console.log('\n【API】ログイン後に応答すること');
for (const p of PROTECTED_APIS) {
  const r = await fetch(`${BASE}${p}`, { headers: { Cookie: COOKIE } });
  const j = await r.json().catch(() => null);
  c(`${p.padEnd(26)} JSONを返す`, r.status === 200 && j !== null && !j.error, `HTTP ${r.status} ${j?.error ?? ''}`);
}

console.log('\n【動的ルート】params が Promise になった箇所');
const orders = await (await fetch(`${BASE}/api/orders`, { headers: { Cookie: COOKIE } })).json();
const one = orders[0];
if (one) {
  const r = await fetch(`${BASE}/api/orders/${one.id}`, { headers: { Cookie: COOKIE } });
  const j = await r.json();
  c('GET /api/orders/[id] が正しい1件を返す', j.id === one.id, JSON.stringify(j).slice(0, 80));
  const edit = await fetch(`${BASE}/orders/${one.id}/edit`, { headers: { Cookie: COOKIE } });
  c('受注修正画面が表示される', edit.status === 200, `HTTP ${edit.status}`);
} else c('受注データがあること', false);

const customers = await (await fetch(`${BASE}/api/customers`, { headers: { Cookie: COOKIE } })).json();
if (customers[0]) {
  const r = await fetch(`${BASE}/api/customers/${customers[0].id}/login`, { headers: { Cookie: COOKIE } });
  const j = await r.json();
  c('GET /api/customers/[id]/login が返る', r.status === 200 && !!j.url, `HTTP ${r.status}`);
}

console.log('\n【cron】ログイン不要だがシークレットは必要');
const cronNo = await fetch(`${BASE}/api/cron/shipping-alert`, { redirect: 'manual' });
c('シークレット無しは 401（リダイレクトではない）', cronNo.status === 401, `HTTP ${cronNo.status}`);
const cronOk = await fetch(`${BASE}/api/cron/shipping-alert?dry=1`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
c('正しいシークレットなら 200', cronOk.status === 200, `HTTP ${cronOk.status}`);

console.log(`\n===== 成功 ${ok} / 失敗 ${ng} =====`);
process.exit(ng === 0 ? 0 : 1);
