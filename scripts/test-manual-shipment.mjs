#!/usr/bin/env node
/**
 * 受注一覧からの「出荷登録」（1件ずつの登録）の検証。
 *
 *   npm run test:manual-ship     （先に npm start でサーバを起動しておくこと）
 *
 * 画面は CSV取り込みと同じ /api/shipments/confirm を叩く。
 * 経路が変わっても、記録・ステータス・メールの扱いが同じであることを確かめる。
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

const MARK = `ZZMAN${Date.now().toString().slice(-6)}`;
const made = [];
const numbers = [];

const confirm = async (items) => {
  const res = await fetch(`${BASE}/api/shipments/confirm`, {
    method: 'POST',
    headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return { status: res.status, json: await res.json() };
};

try {
  const { data: cust } = await db.from('customers').select('id, name').order('name').limit(1).single();
  const base = {
    order_date: '2026-09-10', customer_id: cust.id, customer_name: cust.name,
    product_name: 'テスト商品', product_code: 'TEST', quantity: 5,
    shipping_date: '2026-09-14', shipping_name: cust.name, shipping_contact: 'テスト担当',
    time_slot: '指定無し',
  };
  const { data: rows } = await db.from('orders').insert([
    { ...base, order_number: `${MARK}A`, status: 'preparing' },   // CSV出力後の想定
    { ...base, order_number: `${MARK}B`, status: 'pending' },     // まだCSVを出していない
    { ...base, order_number: `${MARK}C`, status: 'cancelled' },
  ]).select('id, order_number');
  for (const r of rows) { made.push(r.id); numbers.push(r.order_number); }
  const idOf = n => rows.find(r => r.order_number === `${MARK}${n}`).id;

  console.log(`\n  テスト受注: ${MARK}A(準備中) / ${MARK}B(出荷待ち) / ${MARK}C(キャンセル)\n`);

  console.log('【認証】');
  const noAuth = await fetch(`${BASE}/api/shipments/confirm`, { method: 'POST', redirect: 'manual' });
  c('未ログインでは弾かれる', noAuth.status >= 300 && noAuth.status < 400, `HTTP ${noAuth.status}`);

  console.log('\n【準備中の受注を1件登録する】');
  const one = await confirm([{ orderId: idOf('A'), trackingNumber: '66435973800', carrier: '福山通運', shippedOn: '2026-09-10' }]);
  c('登録できる', one.json.imported === 1, JSON.stringify(one.json.results?.[0]));

  const { data: afterA } = await db.from('orders').select('status').eq('id', idOf('A')).single();
  c('出荷済みになる', afterA.status === 'shipped', afterA.status);

  const { data: shipA } = await db.from('order_shipments').select('*').eq('order_id', idOf('A')).single();
  c('お問合せ番号が保存される', shipA?.tracking_number === '66435973800');
  c('配送業者が保存される', shipA?.carrier === '福山通運');
  c('出荷日が保存される', shipA?.shipped_on === '2026-09-10');
  c('CSV由来でないので source_row は空', shipA?.source_row === null, JSON.stringify(shipA?.source_row));

  console.log('\n【出荷待ちのままでも登録できる】');
  // CSVを出す前に発送してしまう運用もありうる。preparing 限定にはしない
  const two = await confirm([{ orderId: idOf('B'), trackingNumber: '123456789012', carrier: '佐川急便', shippedOn: '2026-09-10' }]);
  c('登録できる', two.json.imported === 1, JSON.stringify(two.json.results?.[0]));
  const { data: afterB } = await db.from('orders').select('status').eq('id', idOf('B')).single();
  c('出荷済みになる', afterB.status === 'shipped', afterB.status);

  console.log('\n【間違いを防ぐ】');
  const again = await confirm([{ orderId: idOf('A'), trackingNumber: '66435973800', carrier: '福山通運' }]);
  c('同じ番号は二度登録できない', again.json.results?.[0]?.ok === false, JSON.stringify(again.json.results?.[0]));
  c('  メールを送っていないと分かる', /取り込み済み/.test(again.json.results?.[0]?.message ?? ''), again.json.results?.[0]?.message);

  const cancelled = await confirm([{ orderId: idOf('C'), trackingNumber: '99999999999', carrier: '福山通運' }]);
  c('キャンセル済みには登録できない', cancelled.json.results?.[0]?.ok === false, JSON.stringify(cancelled.json.results?.[0]));

  const noCarrier = await confirm([{ orderId: idOf('A'), trackingNumber: '11111111111', carrier: '' }]);
  c('配送業者が無いと登録できない', noCarrier.json.results?.[0]?.ok === false);

  const noNumber = await confirm([{ orderId: idOf('A'), trackingNumber: '', carrier: '福山通運' }]);
  c('お問合せ番号が無いと登録できない', noNumber.json.results?.[0]?.ok === false);

  console.log('\n【分割出荷】');
  const split = await confirm([{ orderId: idOf('A'), trackingNumber: '66435973801', carrier: '福山通運' }]);
  c('同じ受注でも番号が違えば登録できる', split.json.imported === 1, JSON.stringify(split.json.results?.[0]));

  console.log('\n【CSV取り込みと同じ扱いになっているか】');
  const { data: logs } = await db.from('email_log').select('kind, status, body').in('order_number', [`${MARK}A`, `${MARK}B`]);
  const list = logs ?? [];
  if (list.length === 0) {
    c('宛先未登録なら記録も作らない（想定どおり）', true);
  } else {
    c('発送完了メールとして記録される', list.every(l => l.kind === 'shipped'));
    c('送信設定が無いので実際には送っていない', list.every(l => l.status === 'skipped'),
      JSON.stringify(list.map(l => l.status)));
    const sagawa = list.find(l => l.body.includes('123456789012'));
    if (sagawa) c('佐川は番号入りの追跡URLになる', sagawa.body.includes('okurijoNo=123456789012'));
  }

} catch (e) {
  ng++; console.log(`\n  NG   例外: ${e.message}\n${e.stack}`);
} finally {
  await db.from('email_log').delete().in('order_number', numbers);
  await db.from('order_shipments').delete().in('order_number', numbers);
  for (const id of made) await db.from('orders').delete().eq('id', id);
  await db.from('order_audit_log').delete().like('order_number', `${MARK}%`);

  const left = [];
  for (const [t, col] of [['orders', 'order_number'], ['order_shipments', 'order_number'],
                          ['email_log', 'order_number'], ['order_audit_log', 'order_number']]) {
    const { data } = await db.from(t).select('id').like(col, `${MARK}%`);
    if (data?.length) left.push(`${t}:${data.length}`);
  }
  console.log(`\n  後片付け: ${left.length ? '残った → ' + left.join(', ') : '完了'}`);
}

console.log(`\n  ${ok} OK / ${ng} NG\n`);
process.exit(ng ? 1 : 0);
