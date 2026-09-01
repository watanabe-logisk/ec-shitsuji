#!/usr/bin/env node
/** 操作履歴APIの検証。テスト用の受注を作って必ず削除する。 */
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
const MARK = `ZZAPI${Date.now().toString().slice(-5)}`;
const get = (qs = '') => fetch(`${BASE}/api/audit${qs}`, { headers: { Cookie: COOKIE } }).then(r => r.json());
let id = null;
try {
  console.log('\n【認証】');
  const noAuth = await fetch(`${BASE}/api/audit`, { redirect: 'manual' });
  c('未ログインではリダイレクトされる', noAuth.status >= 300 && noAuth.status < 400, `HTTP ${noAuth.status}`);

  const { data: o } = await db.from('orders').insert([{
    order_number: MARK, customer_name: 'API検証得意先', product_name: 'テスト商品',
    product_code: 'T', quantity: 3, shipping_date: '2099-12-31', status: 'pending',
  }]).select().single();
  id = o.id;
  await db.from('orders').update({ quantity: 8, status: 'shipped' }).eq('id', id);

  console.log('\n【一覧】');
  const all = await get();
  c('配列が返る', Array.isArray(all));
  const mine = all.find(x => x.order_number === MARK);
  c('修正が記録されている', !!mine);
  c('  変更前後が入る', mine?.changed?.quantity?.before === 3 && mine?.changed?.quantity?.after === 8);
  c('  新しい順に並ぶ', all.length < 2 || all[0].acted_at >= all[1].acted_at);

  console.log('\n【絞り込み】');
  const upd = await get('?action=update');
  c('修正だけに絞れる', upd.every(x => x.action === 'update'));
  const byQ = await get(`?q=${MARK}`);
  c('注文番号で絞れる', byQ.length === 1 && byQ[0].order_number === MARK, `${byQ.length}件`);
  const byName = await get('?q=API検証');
  c('得意先名で絞れる', byName.some(x => x.order_number === MARK));
  const weird = await get(`?q=${encodeURIComponent("a,b)c'")}`);
  c('記号を渡しても壊れない', Array.isArray(weird), JSON.stringify(weird).slice(0, 60));

  console.log('\n【削除の記録】');
  await db.from('orders').delete().eq('id', id);
  const del = (await get('?action=delete')).find(x => x.order_number === MARK);
  id = null;
  c('削除が記録される', !!del);
  c('  中身がまるごと残る', del?.snapshot?.quantity === 8 && del?.snapshot?.customer_name === 'API検証得意先');
} catch (e) { ng++; console.error('エラー:', e.message); }
finally {
  if (id) await db.from('orders').delete().eq('id', id);
  await db.from('order_audit_log').delete().eq('order_number', MARK);
  console.log('\nテストデータを削除しました');
}
console.log(`\n===== 成功 ${ok} / 失敗 ${ng} =====`);
process.exit(ng === 0 ? 0 : 1);
