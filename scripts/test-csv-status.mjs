#!/usr/bin/env node
/**
 * CSV出力でステータスが「準備中」へ進むことを検証する。
 * テスト用の受注を作って必ず削除するので、本番DBに対して繰り返し実行できる。
 *
 *   node scripts/test-csv-status.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const { createClient } = await import('@supabase/supabase-js');
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// middleware と同じ方式でセッションCookieを作る
const token = crypto.createHmac('sha256', env.SESSION_SECRET ?? 'fallback')
  .update(env.AUTH_PASSWORD ?? '').digest('hex');
const COOKIE = `ec_shitsuji_session=${token}`;

let passed = 0, failed = 0;
const check = (n, ok, d = '') => {
  if (ok) { passed++; console.log(`  OK   ${n}`); }
  else { failed++; console.log(`  NG   ${n}${d ? `  → ${d}` : ''}`); }
};

const MARK = `ZZTEST${Date.now().toString().slice(-6)}`;
const CASES = ['pending', 'confirmed', 'preparing', 'shipped', 'completed', 'cancelled'];
const created = [];

async function cleanup() {
  if (created.length) await db.from('orders').delete().in('id', created.map(c => c.id));
}

try {
  console.log('\n【準備】各ステータスのテスト受注を作成');
  for (let i = 0; i < CASES.length; i++) {
    const { data, error } = await db.from('orders').insert([{
      order_number: `${MARK}${String(i).padStart(2, '0')}`,
      customer_name: `テスト得意先_${CASES[i]}`,
      product_name: 'テスト商品',
      product_code: 'TESTCODE',
      quantity: 1,
      shipping_date: '2099-12-31',
      status: CASES[i],
    }]).select().single();
    if (error) throw new Error(`${CASES[i]} の作成に失敗: ${error.message}`);
    created.push({ id: data.id, before: CASES[i] });
  }
  check(`${CASES.length}件のテスト受注を作成`, created.length === CASES.length);

  console.log('\n【CSV出力】全ステータスをまとめて出力');
  const res = await fetch(`${BASE_URL}/api/csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ ids: created.map(c => c.id) }),
  });
  check('HTTP 200 が返る', res.status === 200, `HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  check('CSVが空でない', bytes.length > 0, `${bytes.length} バイト`);
  // Shift_JIS なので注文番号（ASCII）で行数を数える
  const hits = (bytes.toString('binary').match(new RegExp(MARK, 'g')) ?? []).length;
  check('選択した6件すべてがCSVに含まれる', hits === 6, `${hits} 件`);

  console.log('\n【ステータス】pending / confirmed だけが準備中へ進む');
  const { data: after } = await db.from('orders')
    .select('id, order_number, status').in('id', created.map(c => c.id));
  const map = new Map(after.map(r => [r.id, r.status]));
  const EXPECTED = {
    pending:   'preparing',   // 進む
    confirmed: 'preparing',   // 進む
    preparing: 'preparing',   // 変わらない（二重出力しても同じ）
    shipped:   'shipped',     // 巻き戻らない
    completed: 'completed',   // 巻き戻らない
    cancelled: 'cancelled',   // 復活しない
  };
  for (const c of created) {
    const got = map.get(c.id);
    const want = EXPECTED[c.before];
    const arrow = c.before === want ? '据え置き' : `→ ${want}`;
    check(`${c.before.padEnd(10)} は ${arrow}`, got === want, `実際: ${got}`);
  }

  console.log('\n【冪等性】同じ選択でもう一度CSV出力しても状態が動かない');
  const res2 = await fetch(`${BASE_URL}/api/csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ ids: created.map(c => c.id) }),
  });
  check('  HTTP 200 が返る', res2.status === 200, `HTTP ${res2.status}`);
  const { data: after2 } = await db.from('orders')
    .select('id, status').in('id', created.map(c => c.id));
  const map2 = new Map(after2.map(r => [r.id, r.status]));
  const stable = created.every(c => map2.get(c.id) === map.get(c.id));
  check('  2回目で状態が変わらない', stable);

  console.log('\n【未ログイン】Cookie無しではCSVを出せない＝状態も動かない');
  await db.from('orders').update({ status: 'pending' }).eq('id', created[0].id);
  const noAuth = await fetch(`${BASE_URL}/api/csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [created[0].id] }),
    redirect: 'manual',
  });
  check('  CSVが返らない（リダイレクトされる）', noAuth.status >= 300 && noAuth.status < 400, `HTTP ${noAuth.status}`);
  const { data: guard } = await db.from('orders')
    .select('status').eq('id', created[0].id).single();
  check('  ステータスは pending のまま', guard.status === 'pending', guard.status);
} catch (e) {
  failed++;
  console.error('\nテスト実行中にエラー:', e.message);
} finally {
  await cleanup();
  const { count } = await db.from('orders')
    .select('id', { count: 'exact', head: true }).like('order_number', `${MARK}%`);
  console.log(`\nテスト受注を削除しました（残り ${count ?? 0} 件）`);
}

console.log(`\n===== 成功 ${passed} / 失敗 ${failed} =====`);
process.exit(failed === 0 ? 0 : 1);
