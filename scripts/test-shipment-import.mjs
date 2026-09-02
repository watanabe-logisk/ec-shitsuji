#!/usr/bin/env node
/**
 * 出荷実績の取り込みを通しで検証する。
 *
 *   npm run test:import        （先に npm start でサーバを起動しておくこと）
 *
 * テスト用の受注を作り、CSVを組み立てて取り込ませ、最後に必ず消す。
 * 実在の受注には一切触れない。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import iconv from 'iconv-lite';
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

const MARK = `ZZSHIP${Date.now().toString().slice(-6)}`;
const A = `${MARK}A`;   // 完全一致する受注
const B = `${MARK}B`;   // WMS側の番号に含まれる形
const C = `${MARK}C`;   // キャンセル済み
const madeOrders = [];
const madeRecipients = [];

/** WMSと同じ形（Shift_JIS・全項目クォート）のCSVを作る */
function buildCsv(rows) {
  const headers = ['出荷日', '注文番号', '注文者氏名', 'お問合せ番号', '代引金額合計',
    '注文商品点数', '発送元情報', '決済方法', '代引ステータス', '送料サイズ',
    '発送日', '都道府県', '便種', '個数', '発送先名', 'メールアドレス'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(q).join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => q(r[h] ?? '')).join(','));
  }
  return iconv.encode(lines.join('\r\n'), 'Shift_JIS');
}

const preview = async (buf, name = 'test.csv') => {
  const fd = new FormData();
  fd.append('file', new Blob([buf]), name);
  const res = await fetch(`${BASE}/api/shipments/preview`, { method: 'POST', body: fd, headers: { Cookie: COOKIE } });
  return { status: res.status, json: await res.json() };
};
const confirm = async (items) => {
  const res = await fetch(`${BASE}/api/shipments/confirm`, {
    method: 'POST', headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return { status: res.status, json: await res.json() };
};

try {
  // --- 準備 ---
  const { data: cust } = await db.from('customers').select('id, name').order('name').limit(1).single();
  const base = {
    order_date: '2026-09-01', customer_id: cust.id, customer_name: cust.name,
    product_name: 'テスト商品', product_code: 'TEST', quantity: 5,
    shipping_date: '2026-09-03', shipping_name: cust.name, shipping_contact: 'テスト担当',
    time_slot: '指定無し', status: 'preparing',
  };
  const { data: made } = await db.from('orders').insert([
    { ...base, order_number: A },
    { ...base, order_number: B },
    { ...base, order_number: C, status: 'cancelled' },
  ]).select('id, order_number');
  for (const o of made) madeOrders.push(o.id);
  const idOf = n => made.find(o => o.order_number === n).id;

  console.log(`\n  テスト受注: ${A} / ${B} / ${C}（${cust.name}）\n`);

  console.log('【認証】');
  const noAuth = await fetch(`${BASE}/api/shipments/preview`, { method: 'POST', redirect: 'manual' });
  c('未ログインでは弾かれる', noAuth.status >= 300 && noAuth.status < 400, `HTTP ${noAuth.status}`);

  console.log('\n【読み取り】');
  const bad = await preview(Buffer.from('あ,い\n1,2', 'utf8'));
  c('列が違うCSVは受け付けない', bad.status === 400 && /注文番号/.test(bad.json.error), bad.json.error);

  const csv = buildCsv([
    { 出荷日: '20260901 10:32', 注文番号: A, お問合せ番号: '66435973800', 発送先名: cust.name },
    { 出荷日: '20260901 10:33', 注文番号: `NES-MEG-${B}`, お問合せ番号: '123456789012', 発送先名: cust.name },
    { 出荷日: '20260901 10:34', 注文番号: C, お問合せ番号: '99999999999', 発送先名: cust.name },
    { 出荷日: '20260901 10:35', 注文番号: 'UNKNOWN-999', お問合せ番号: '1234567890', 発送先名: cust.name },
  ]);
  const p = await preview(csv, '出荷実績.csv');
  c('Shift_JISのCSVを読める', p.status === 200 && p.json.rows?.length === 4, JSON.stringify(p.json).slice(0, 200));

  const byTracking = Object.fromEntries((p.json.rows ?? []).map(r => [r.trackingNumber, r]));
  const rA = byTracking['66435973800'], rB = byTracking['123456789012'],
        rC = byTracking['99999999999'], rD = byTracking['1234567890'];

  console.log('\n【照合】');
  c('注文番号が一致すれば結び付く', rA?.kind === 'exact' && rA.order?.orderNumber === A, rA?.kind);
  c('NES-MEG-◯◯◯ の形でも結び付く', rB?.kind === 'contained' && rB.order?.orderNumber === B, rB?.kind);
  c('知らない番号は結び付けない', rD?.kind === 'none' && rD.order === null, rD?.kind);
  c('結び付かない行には候補を出す', (rD?.candidates?.length ?? 0) > 0, `${rD?.candidates?.length}件`);

  console.log('\n【配送業者の判定】');
  c('11桁は福山通運', rA?.carrier === '福山通運', rA?.carrier);
  c('12桁は佐川急便', rB?.carrier === '佐川急便', rB?.carrier);
  c('10桁は判定しない', rD?.carrier === null, rD?.carrier);

  console.log('\n【キャンセル済み】');
  c('キャンセル済みは取り込めない印が付く', !!rC?.blocked, rC?.blocked ?? '印が無い');
  const cRes = await confirm([{ orderId: idOf(C), trackingNumber: '99999999999', carrier: '福山通運', shippedOn: '2026-09-01' }]);
  c('APIを直接叩いても取り込まれない', cRes.json.results?.[0]?.ok === false, JSON.stringify(cRes.json.results?.[0]));
  const { count: cCount } = await db.from('order_shipments').select('*', { count: 'exact', head: true }).eq('order_id', idOf(C));
  c('キャンセル済みには記録が残らない', cCount === 0, `${cCount}件`);

  console.log('\n【入力の検証】');
  const noCarrier = await confirm([{ orderId: idOf(A), trackingNumber: '66435973800', carrier: '' }]);
  c('配送業者が無いと取り込まない', noCarrier.json.results?.[0]?.ok === false, JSON.stringify(noCarrier.json.results?.[0]));
  const noTracking = await confirm([{ orderId: idOf(A), trackingNumber: '', carrier: '福山通運' }]);
  c('お問合せ番号が無いと取り込まない', noTracking.json.results?.[0]?.ok === false);
  const empty = await confirm([]);
  c('空の取り込みは弾く', empty.status === 400);

  console.log('\n【取り込み】');
  const done = await confirm([
    { orderId: idOf(A), trackingNumber: '66435973800', carrier: '福山通運', shippedOn: '2026-09-01', raw: { 注文番号: A } },
    { orderId: idOf(B), trackingNumber: '123456789012', carrier: '佐川急便', shippedOn: '2026-09-01' },
  ]);
  c('2件とも取り込める', done.json.imported === 2, JSON.stringify(done.json.results));

  const { data: ships } = await db.from('order_shipments').select('*').in('order_id', [idOf(A), idOf(B)]);
  c('記録が2件残る', ships?.length === 2);
  c('配送業者が保存される', ships?.some(s => s.carrier === '福山通運') && ships?.some(s => s.carrier === '佐川急便'));
  c('出荷日が保存される', ships?.every(s => s.shipped_on === '2026-09-01'));
  c('取り込んだCSVの行を残している', ships?.some(s => s.source_row && s.source_row['注文番号'] === A));

  const { data: after } = await db.from('orders').select('order_number, status').in('id', [idOf(A), idOf(B), idOf(C)]);
  c('ステータスが出荷済みになる', after.filter(o => o.status === 'shipped').length === 2, JSON.stringify(after));
  c('キャンセル済みは変わらない', after.find(o => o.order_number === C).status === 'cancelled');

  console.log('\n【二重取り込みを防ぐ】');
  const again = await confirm([{ orderId: idOf(A), trackingNumber: '66435973800', carrier: '福山通運' }]);
  c('同じ番号は二度取り込めない', again.json.results?.[0]?.ok === false, JSON.stringify(again.json.results?.[0]));
  c('メールを送っていないと分かる文言を返す', /取り込み済み/.test(again.json.results?.[0]?.message ?? ''), again.json.results?.[0]?.message);
  const { count: dupCount } = await db.from('order_shipments').select('*', { count: 'exact', head: true }).eq('order_id', idOf(A));
  c('記録は増えない', dupCount === 1, `${dupCount}件`);

  const p2 = await preview(csv, '出荷実績.csv');
  const again2 = (p2.json.rows ?? []).find(r => r.trackingNumber === '66435973800');
  c('二度目の読み込みで取り込み済みと表示される', again2?.alreadyImported === true);

  console.log('\n【分割出荷】');
  const split = await confirm([{ orderId: idOf(A), trackingNumber: '66435973801', carrier: '福山通運' }]);
  c('同じ受注でも番号が違えば取り込める', split.json.imported === 1, JSON.stringify(split.json.results?.[0]));

  console.log('\n【メール】');
  const { data: logs } = await db.from('email_log').select('*').eq('kind', 'shipped').in('order_number', [A, B]);
  c('送信設定が無いので実際には送っていない', (logs ?? []).every(l => l.status === 'skipped'),
    JSON.stringify((logs ?? []).map(l => l.status)));
  if ((logs ?? []).length === 0) {
    c('宛先未登録なら記録も作らない（想定どおり）', true);
  }

  // 宛先を登録して、本文が組み立てられることまで見る
  const { data: rec } = await db.from('customer_email_recipients')
    .insert({ customer_id: cust.id, email: `${MARK.toLowerCase()}@example.co.jp`, label: 'テスト担当' })
    .select().single();
  madeRecipients.push(rec.id);

  const withMail = await confirm([{ orderId: idOf(B), trackingNumber: '123456789099', carrier: '佐川急便' }]);
  c('宛先があるときも取り込める', withMail.json.imported === 1);
  const { data: log2 } = await db.from('email_log').select('*').eq('order_number', B).eq('kind', 'shipped')
    .order('created_at', { ascending: false }).limit(1).single();
  c('送信を記録している', !!log2);
  c('送信設定が無いので skipped', log2?.status === 'skipped', log2?.status);
  c('件名に注文番号が入る', log2?.subject?.includes(B), log2?.subject);
  c('本文に担当者名の宛名が入る', log2?.body?.includes('テスト担当様'), log2?.body?.split('\n').slice(0, 2).join(' / '));
  c('本文にお問合せ番号が入る', log2?.body?.includes('123456789099'));
  c('佐川は番号入りの追跡URLになる', log2?.body?.includes('okurijoNo=123456789099'));

  const { data: log1 } = await db.from('email_log').select('body').eq('order_number', A).eq('kind', 'shipped')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (log1) c('福山は入力ページを案内する', log1.body.includes('corp.fukutsu.co.jp'));

} catch (e) {
  ng++; console.log(`\n  NG   例外: ${e.message}\n${e.stack}`);
} finally {
  // 後片付け。作ったものは必ず消す
  for (const id of madeRecipients) await db.from('customer_email_recipients').delete().eq('id', id);
  await db.from('email_log').delete().in('order_number', [A, B, C]);
  await db.from('order_shipments').delete().in('order_number', [A, B, C]);
  for (const id of madeOrders) await db.from('orders').delete().eq('id', id);

  const leftovers = [];
  for (const [t, col] of [['orders', 'order_number'], ['order_shipments', 'order_number'], ['email_log', 'order_number']]) {
    const { data } = await db.from(t).select('id').like(col, `${MARK}%`);
    if (data?.length) leftovers.push(`${t}:${data.length}`);
  }
  const { data: audit } = await db.from('order_audit_log').select('id').like('order_number', `${MARK}%`);
  if (audit?.length) { await db.from('order_audit_log').delete().like('order_number', `${MARK}%`); }
  console.log(`\n  後片付け: ${leftovers.length ? '残った → ' + leftovers.join(', ') : '完了'}（履歴 ${audit?.length ?? 0} 件も削除）`);
}

console.log(`\n  ${ok} OK / ${ng} NG\n`);
process.exit(ng ? 1 : 0);
