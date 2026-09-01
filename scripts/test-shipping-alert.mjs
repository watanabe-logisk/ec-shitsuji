#!/usr/bin/env node
/**
 * 朝の出荷アラート（/api/cron/shipping-alert）の検証。
 *
 *   node scripts/test-shipping-alert.mjs           # Chatworkへは投稿しない
 *   node scripts/test-shipping-alert.mjs --post    # 実際に1通投稿する
 *
 * テスト用の受注を作って必ず削除するので、本番DBに対して繰り返し実行できる。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const DO_POST = process.argv.includes('--post');

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const { createClient } = await import('@supabase/supabase-js');
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let passed = 0, failed = 0;
const check = (n, ok, d = '') => {
  if (ok) { passed++; console.log(`  OK   ${n}`); }
  else { failed++; console.log(`  NG   ${n}${d ? `  → ${d}` : ''}`); }
};

const JST = 9 * 60 * 60 * 1000;
const jstToday = () => new Date(Date.now() + JST).toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** 土日を飛ばして n 営業日ぶん進めた日付。lib/shipping.ts の逆算に対応する */
function addBusinessDays(s, n) {
  let d = s, moved = 0;
  while (moved < n) {
    d = addDays(d, 1);
    const day = new Date(d + 'T00:00:00Z').getUTCDay();
    if (day !== 0 && day !== 6) moved++;
  }
  return d;
}

/**
 * 既定は dry=1。Chatwork へは投稿せず集計だけする。
 * これを付け忘れると、テストを流すたびにルームへ通知が飛んでしまう。
 */
const call = (headers = {}, { dry = true } = {}) =>
  fetch(`${BASE_URL}/api/cron/shipping-alert${dry ? '?dry=1' : ''}`, { headers });

const MARK = `ZZALERT${Date.now().toString().slice(-5)}`;
const created = [];
async function mkOrder(suffix, shippingDate, status, extra = 0) {
  const { data, error } = await db.from('orders').insert([{
    order_number: `${MARK}${suffix}`,
    customer_name: `テスト_${suffix}`,
    product_name: 'テスト商品', product_code: 'TESTCODE', quantity: 1,
    shipping_date: shippingDate, status, alert_extra_days: extra,
  }]).select().single();
  if (error) throw new Error(`${suffix}: ${error.message}`);
  created.push(data.id);
  return data;
}

try {
  const today = jstToday();
  console.log(`\nJSTの本日: ${today}`);

  console.log('\n【認証】CRON_SECRET を知らない呼び出しは弾く');
  const noAuth = await call();
  check('ヘッダー無しは 401', noAuth.status === 401, `HTTP ${noAuth.status}`);
  const wrong = await call({ Authorization: 'Bearer wrong-secret' });
  check('誤ったシークレットは 401', wrong.status === 401, `HTTP ${wrong.status}`);
  const noBearer = await call({ Authorization: env.CRON_SECRET });
  check('Bearer 無しは 401', noBearer.status === 401, `HTTP ${noBearer.status}`);
  const AUTH = { Authorization: `Bearer ${env.CRON_SECRET}` };

  console.log('\n【middleware】ログインCookieが無くてもルートに到達する');
  const reached = await call(AUTH);
  check('ログイン画面へリダイレクトされない', reached.status !== 307 && reached.status !== 302, `HTTP ${reached.status}`);
  const baseline = await reached.json();
  check('JSONが返る', typeof baseline.count === 'number', JSON.stringify(baseline).slice(0, 120));
  console.log(`       現在の対象件数: ${baseline.count}件`);

  console.log('\n【抽出条件】');
  // 本日が出荷期限＝配送指定日は今日から2営業日後
  const dueToday = addBusinessDays(today, 2);
  await mkOrder('A', dueToday, 'pending');
  const a = await (await call(AUTH)).json();
  check('本日が出荷期限の pending が対象になる', a.count === baseline.count + 1, `${a.count}件`);

  await mkOrder('B', dueToday, 'preparing');
  const b = await (await call(AUTH)).json();
  check('CSV出力済み(preparing)も対象に残る', b.count === baseline.count + 2, `${b.count}件`);

  await mkOrder('C', dueToday, 'shipped');
  await mkOrder('D', dueToday, 'cancelled');
  const cd = await (await call(AUTH)).json();
  check('出荷済み・キャンセルは対象外', cd.count === baseline.count + 2, `${cd.count}件`);

  // 出荷期限がまだ先＝配送指定日が十分先
  await mkOrder('E', addBusinessDays(today, 10), 'pending');
  const e = await (await call(AUTH)).json();
  check('出荷期限がまだ先の注文は対象外', e.count === baseline.count + 2, `${e.count}件`);

  // 配送指定日が過去＝もう間に合わないので対象外
  await mkOrder('F', addDays(today, -3), 'pending');
  const f = await (await call(AUTH)).json();
  check('配送指定日を過ぎた注文は対象外', f.count === baseline.count + 2, `${f.count}件`);

  console.log('\n【期限超過】');
  const overdueBefore = f.overdue;
  // 出荷期限は過ぎているが、配送指定日はまだ先（＝今から急げば間に合うかもしれない）
  await mkOrder('G', addBusinessDays(today, 1), 'pending');
  const g = await (await call(AUTH)).json();
  check('出荷期限超過の注文が対象に入る', g.count === baseline.count + 3, `${g.count}件`);
  check('  期限超過として数えられる', g.overdue === overdueBefore + 1, `${g.overdue}件`);

  console.log('\n【延長日数】');
  // alert_extra_days=5 なら 2+5=7営業日前が出荷期限 → 本日が期限になる配送日
  await mkOrder('H', addBusinessDays(today, 7), 'pending', 5);
  const h = await (await call(AUTH)).json();
  check('alert_extra_days が出荷期限に反映される', h.count === baseline.count + 4, `${h.count}件`);

  console.log('\n【通知本文】');
  const dry = await (await call(AUTH)).json();
  check('dry=1 では投稿しない', dry.dryRun === true, JSON.stringify(dry).slice(0, 80));
  check('  件数が本文に入る', dry.message.includes(`${dry.count}件`), dry.message.slice(0, 60));
  check('  期限超過の注文に ⚠ が付く', dry.overdue === 0 || dry.message.includes('⚠'));
  check('  対象の注文番号が本文に載る', dry.message.includes(`${MARK}A`));
  check('  対象外の注文番号は載らない', !dry.message.includes(`${MARK}C`) && !dry.message.includes(`${MARK}E`));
  check('  Chatworkのタグが閉じている',
    (dry.message.match(/\[info\]/g) ?? []).length === 1 && (dry.message.match(/\[\/info\]/g) ?? []).length === 1);

  if (DO_POST) {
    console.log('\n【実投稿】Chatwork へ1通送る');
    const post = await call(AUTH, { dry: false });
    const json = await post.json();
    check('投稿に成功する', post.status === 200 && json.ok === true, JSON.stringify(json).slice(0, 200));
    check('  スキップされていない（トークン設定済み）', json.skipped === false, `skipped=${json.skipped}`);
    console.log('       Chatwork のルームを確認してください。');
  } else {
    console.log('\n【実投稿】--post を付けると実際に1通送ります（今回は送信済みの通知内容のみ検証）');
  }
} catch (e) {
  failed++;
  console.error('\nテスト実行中にエラー:', e.message);
} finally {
  if (created.length) await db.from('orders').delete().in('id', created);
  const { count } = await db.from('orders')
    .select('id', { count: 'exact', head: true }).like('order_number', `${MARK}%`);
  console.log(`\nテスト受注を削除しました（残り ${count ?? 0} 件）`);
}

console.log(`\n===== 成功 ${passed} / 失敗 ${failed} =====`);
process.exit(failed === 0 ? 0 : 1);
