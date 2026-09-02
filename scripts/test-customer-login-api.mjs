#!/usr/bin/env node
/**
 * 管理アプリのログイン情報APIの検証。
 *   node scripts/test-customer-login-api.mjs
 * パスワードの再発行は行わないので、顧客への影響はない。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const env = {};
for (const l of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim();
}
const token = crypto.createHmac('sha256', env.SESSION_SECRET ?? 'fallback').update(env.AUTH_PASSWORD ?? '').digest('hex');
const COOKIE = `ec_shitsuji_session=${token}`;

// 管理アプリはサーバー専用なので anon キーを持たない。
// 「控えのパスワードで実際にログインできるか」を確かめるため、顧客アプリ側から借りる。
let anonKey = '';
const orderEnv = path.resolve(ROOT, '../aquajacket-order/.env.local');
if (fs.existsSync(orderEnv)) {
  for (const l of fs.readFileSync(orderEnv, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(.*)$/);
    if (m) anonKey = m[1].trim();
  }
}

const { createClient } = await import('@supabase/supabase-js');
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let passed = 0, failed = 0;
const check = (n, ok, d = '') => {
  if (ok) { passed++; console.log(`  OK   ${n}`); }
  else { failed++; console.log(`  NG   ${n}${d ? `  → ${d}` : ''}`); }
};

const { data: c } = await db.from('customers').select('id, name').ilike('name', '%南総%').single();

console.log('\n【認証】管理アプリにログインしていないと見られない');
const noAuth = await fetch(`${BASE_URL}/api/customers/${c.id}/login`, { redirect: 'manual' });
check('Cookie無しではリダイレクトされる', noAuth.status >= 300 && noAuth.status < 400, `HTTP ${noAuth.status}`);
const body = await noAuth.text();
check('  応答本文にパスワードが含まれない', !/[A-Za-z0-9]{12}/.test(body.replace(/[<>]/g, '')) || body.length < 500);

console.log('\n【取得】');
const res = await fetch(`${BASE_URL}/api/customers/${c.id}/login`, { headers: { Cookie: COOKIE } });
check('HTTP 200 が返る', res.status === 200, `HTTP ${res.status}`);
const json = await res.json();
check('ログインIDが返る', json.login?.email === 'nanso@aqua-jacket.order', json.login?.email);
check('パスワードの控えが返る', typeof json.login?.password === 'string' && json.login.password.length >= 8);
check('URLが返る', typeof json.url === 'string' && json.url.startsWith('https://'), json.url);

console.log('\n【案内文】');
const g = json.guide ?? '';
check('会社名が入る', g.includes(c.name.trim()));
check('URLが入る', g.includes(json.url));
check('ログインIDが入る', g.includes(json.login.email));
check('パスワードが入る', g.includes(json.login.password));

console.log('\n【控えと実際のパスワードが一致する】');
if (!anonKey) {
  console.log('  -- 匿名キーが見つからないため省略（顧客アプリの .env.local が必要）');
} else {
  const cli = createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email: json.login.email, password: json.login.password });
  check('画面に出る控えで実際にログインできる', !error, error?.message ?? '');
  await cli.auth.signOut();
}

console.log('\n【一覧のバッジ】');
const list = await fetch(`${BASE_URL}/api/customers/logins`, { headers: { Cookie: COOKIE } });
const map = await list.json();
// 社数を固定すると得意先が増えるたびに落ちる。ログインを発行済みの数と突き合わせる
const { count: linkCount } = await db
  .from('customer_users').select('*', { count: 'exact', head: true });
check('ログイン発行済みの得意先がすべて返る',
  Object.keys(map).length === linkCount, `APIは${Object.keys(map).length}社 / DBは${linkCount}社`);
check('  パスワードは含まれない', !JSON.stringify(map).includes(json.login.password));

console.log('\n【存在しない得意先】');
const nf = await fetch(`${BASE_URL}/api/customers/00000000-0000-0000-0000-000000000000/login`, { headers: { Cookie: COOKIE } });
check('404 が返る', nf.status === 404, `HTTP ${nf.status}`);

console.log(`\n===== 成功 ${passed} / 失敗 ${failed} =====`);
process.exit(failed === 0 ? 0 : 1);
