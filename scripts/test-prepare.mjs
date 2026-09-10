#!/usr/bin/env node
/**
 * 「準備中にする」とCSV出力の検証。
 *
 *   npm run test:prepare      （先に npm start でサーバを起動しておくこと）
 *
 * 2つの操作で結果が同じになること、対象外のものを巻き込まないこと、
 * 同じ受注に二度メールを送らないことを見る。
 * テスト用の受注を作り、最後に必ず消す。
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
const { createClient } = await import('@supabase/supabase-js');
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0, ng = 0;
const c = (n, v, d = '') => { if (v) { ok++; console.log(`  OK   ${n}`); } else { ng++; console.log(`  NG   ${n}${d ? `  → ${d}` : ''}`); } };

const MARK = `ZZPREP${Date.now().toString().slice(-6)}`;
const made = [];
const numbers = [];
let recipientId = null;

const prepare = async (ids) => {
  const res = await fetch(`${BASE}/api/orders/prepare`, {
    method: 'POST', headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return { status: res.status, json: await res.json() };
};
const statusOf = async (id) =>
  (await db.from('orders').select('status').eq('id', id).single()).data?.status;
const mailsFor = async (num, kind) =>
  (await db.from('email_log').select('*').eq('order_number', num).eq('kind', kind)).data ?? [];

try {
  const { data: cust } = await db.from('customers').select('id, name').order('name').limit(1).single();

  // 宛先を1件だけ用意する。実在の宛先には送らない
  const { data: rec } = await db.from('customer_email_recipients')
    .insert({ customer_id: cust.id, email: `${MARK.toLowerCase()}@example.co.jp`, label: 'テスト担当' })
    .select().single();
  recipientId = rec.id;

  const base = {
    order_date: '2026-09-10', customer_id: cust.id, customer_name: cust.name,
    product_name: 'テスト商品', product_code: 'TEST', quantity: 5,
    shipping_date: '2026-09-17', shipping_name: cust.name, shipping_contact: 'テスト担当',
    time_slot: '指定無し',
  };
  const { data: rows } = await db.from('orders').insert([
    { ...base, order_number: `${MARK}A`, status: 'pending' },
    { ...base, order_number: `${MARK}B`, status: 'confirmed' },
    { ...base, order_number: `${MARK}C`, status: 'preparing' },
    { ...base, order_number: `${MARK}D`, status: 'shipped' },
    { ...base, order_number: `${MARK}E`, status: 'cancelled' },
    { ...base, order_number: `${MARK}F`, status: 'pending' },   // CSV出力で使う
  ]).select('id, order_number');
  for (const r of rows) { made.push(r.id); numbers.push(r.order_number); }
  const idOf = n => rows.find(r => r.order_number === `${MARK}${n}`).id;

  console.log(`\n  対象: ${cust.name}（宛先1件を仮登録）`);
  console.log(`  A=出荷待ち B=受注確定 C=準備中 D=出荷済み E=キャンセル F=CSV用\n`);

  console.log('【認証】');
  const noAuth = await fetch(`${BASE}/api/orders/prepare`, { method: 'POST', redirect: 'manual' });
  c('未ログインでは弾かれる', noAuth.status >= 300 && noAuth.status < 400, `HTTP ${noAuth.status}`);

  console.log('\n【入力の検証】');
  const empty = await prepare([]);
  c('空の指定は弾く', empty.status === 400, `HTTP ${empty.status}`);

  console.log('\n【準備中にする】');
  const res = await prepare([idOf('A'), idOf('B'), idOf('C'), idOf('D'), idOf('E')]);
  c('リクエストが通る', res.status === 200, JSON.stringify(res.json).slice(0, 150));
  c('進んだのは出荷待ちと受注確定の2件だけ', res.json.advanced?.length === 2,
    JSON.stringify(res.json.advanced?.map(a => a.orderNumber)));
  c('対象外の3件は理由つきで返る', res.json.skipped?.length === 3,
    JSON.stringify(res.json.skipped));

  c('出荷待ち → 準備中', await statusOf(idOf('A')) === 'preparing');
  c('受注確定 → 準備中', await statusOf(idOf('B')) === 'preparing');
  c('準備中はそのまま', await statusOf(idOf('C')) === 'preparing');
  c('出荷済みは変えない', await statusOf(idOf('D')) === 'shipped');
  c('キャンセルは変えない', await statusOf(idOf('E')) === 'cancelled');

  console.log('\n【メール】');
  const mailA = await mailsFor(`${MARK}A`, 'preparing');
  c('出荷準備メールが記録される', mailA.length === 1, `${mailA.length}件`);
  c('  送信設定が無いので実際には送っていない', mailA[0]?.status === 'skipped', mailA[0]?.status);
  c('  件名に注文番号が入る', mailA[0]?.subject?.includes(`${MARK}A`), mailA[0]?.subject);
  c('  件名が「出荷の準備に入りました」', mailA[0]?.subject?.includes('出荷の準備に入りました'), mailA[0]?.subject);
  c('  宛名に担当者名が入る', mailA[0]?.body?.includes('テスト担当様'));
  c('  お届け予定日が和暦で入る', mailA[0]?.body?.includes('2026年9月17日(木)'), mailA[0]?.body?.match(/お届け予定日.*/)?.[0]);
  c('  お問合せ番号は書かない（まだ発送していない）', !mailA[0]?.body?.includes('お問合せ番号:'));

  c('対象外の受注にはメールを作らない',
    (await mailsFor(`${MARK}C`, 'preparing')).length === 0
    && (await mailsFor(`${MARK}E`, 'preparing')).length === 0);

  console.log('\n【二度送らない】');
  const again = await prepare([idOf('A'), idOf('B')]);
  c('既に準備中なら進めない', again.json.advanced?.length === 0, JSON.stringify(again.json.advanced));
  c('メールも増えない', (await mailsFor(`${MARK}A`, 'preparing')).length === 1);

  console.log('\n【CSV出力でも同じ結果になる】');
  const csv = await fetch(`${BASE}/api/csv`, {
    method: 'POST', headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [idOf('F'), idOf('E')] }),
  });
  c('CSVが返る', csv.status === 200 && (csv.headers.get('content-type') ?? '').includes('csv'),
    `HTTP ${csv.status}`);
  c('CSV出力でも準備中になる', await statusOf(idOf('F')) === 'preparing');
  c('CSV出力でもキャンセルは変えない', await statusOf(idOf('E')) === 'cancelled');

  const mailF = await mailsFor(`${MARK}F`, 'preparing');
  c('CSV出力でも同じメールが記録される', mailF.length === 1, `${mailF.length}件`);
  c('  文面がボタン経由と同じ', mailF[0]?.body?.replace(new RegExp(`${MARK}F`, 'g'), 'X')
    === mailA[0]?.body?.replace(new RegExp(`${MARK}A`, 'g'), 'X'));
  c('CSV出力でもキャンセルにはメールを送らない',
    (await mailsFor(`${MARK}E`, 'preparing')).length === 0);

} catch (e) {
  ng++; console.log(`\n  NG   例外: ${e.message}\n${e.stack}`);
} finally {
  if (recipientId) await db.from('customer_email_recipients').delete().eq('id', recipientId);
  await db.from('email_log').delete().in('order_number', numbers);
  for (const id of made) await db.from('orders').delete().eq('id', id);
  const { cleanupTestLogs } = await import('./cleanup-test-logs.mjs');
  const removed = await cleanupTestLogs(db, MARK);

  const left = [];
  for (const [t, col] of [['orders', 'order_number'], ['email_log', 'order_number'],
                          ['order_audit_log', 'order_number']]) {
    const { data } = await db.from(t).select('id').like(col, `${MARK}%`);
    if (data?.length) left.push(`${t}:${data.length}`);
  }
  console.log(`\n  後片付け: ${left.length ? '残った → ' + left.join(', ') : '完了'}（履歴 ${removed} 件も削除）`);
}

console.log(`\n  ${ok} OK / ${ng} NG\n`);
process.exit(ng ? 1 : 0);
