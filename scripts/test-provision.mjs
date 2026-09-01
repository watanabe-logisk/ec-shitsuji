#!/usr/bin/env node
/**
 * 「新規得意先を受注登録 → Web発注を開通 → 顧客がログインして発注できる」までの通しテスト。
 *
 *   npm run test:provision
 *
 * 作った得意先・受注・アカウントは最後にすべて削除する。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

const env = {};
for (const l of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

// 管理アプリは anon キーを持たないので、顧客ログインの確認用に顧客アプリ側から借りる
let anonKey = '';
const orderEnv = path.resolve(ROOT, '../aquajacket-order/.env.local');
if (fs.existsSync(orderEnv)) {
  for (const l of fs.readFileSync(orderEnv, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(.*)$/);
    if (m) anonKey = m[1].trim();
  }
}

const COOKIE = `ec_shitsuji_session=${crypto
  .createHmac('sha256', env.SESSION_SECRET ?? 'fallback')
  .update(env.AUTH_PASSWORD ?? '')
  .digest('hex')}`;

const { createClient } = await import('@supabase/supabase-js');
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0, ng = 0;
const c = (n, v, d = '') => {
  if (v) { ok++; console.log(`  OK   ${n}`); }
  else { ng++; console.log(`  NG   ${n}${d ? `  → ${d}` : ''}`); }
};

const STAMP = Date.now().toString().slice(-6);
const NAME = `ZZ開通テスト${STAMP}`;
const LOGIN_ID = `zztest${STAMP}`;
const EMAIL = `${LOGIN_ID}@aqua-jacket.order`;
const ADDRESS = '東京都千代田区丸の内1-1-1';

let customerId = null;
let userId = null;

try {
  console.log('\n【1回目】管理画面から受注を登録する');
  const created = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({
      shipping_name: NAME,
      shipping_contact: 'フロントご担当者様',
      shipping_postal_code: '100-0005',
      shipping_address: ADDRESS,
      shipping_phone: '03-1234-5678',
      product_name: 'FUJI SUN SUI 500ml 24本',
      product_code: 'fujisansui24',
      quantity: 12,
      shipping_date: '2099-12-31',
      time_slot: '午前中',
      notes: '',
      alert_extra_days: 0,
    }),
  });
  const order = await created.json();
  c('受注が登録される', created.status === 200 && !!order.id, JSON.stringify(order).slice(0, 80));
  customerId = order.customer_id;
  c('  得意先が自動作成される', !!customerId);

  console.log('\n【開通前】まだ発注できない状態であること');
  const before = await (await fetch(`${BASE}/api/customers/${customerId}/provision`, { headers: { Cookie: COOKIE } })).json();
  c('ログインは未発行', before.hasLogin === false);
  c('開通できる状態になっている', before.plan?.canProvision === true, before.plan?.reason ?? '');
  c('  注文から商品を1件拾える', before.plan?.products?.length === 1, `${before.plan?.products?.length}件`);
  c('    商品名が正しい', !!before.plan?.products?.[0]?.name?.includes('FUJI SUN SUI'), before.plan?.products?.[0]?.name);
  c('  注文から納品先を1件拾える', before.plan?.addresses?.length === 1, `${before.plan?.addresses?.length}件`);
  c('    住所が正しい', before.plan?.addresses?.[0]?.address === ADDRESS, before.plan?.addresses?.[0]?.address);
  c('    宛名が正しい', before.plan?.addresses?.[0]?.contactName === 'フロントご担当者様');
  c('  時間帯が引き継がれる', before.plan?.timeSlot === '午前中', before.plan?.timeSlot);

  console.log('\n【開通】');
  const res = await fetch(`${BASE}/api/customers/${customerId}/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ loginId: LOGIN_ID }),
  });
  const prov = await res.json();
  c('開通に成功する', res.status === 200, `HTTP ${res.status} ${prov.error ?? ''}`);
  c('  商品が1件設定される', prov.applied?.productsAdded === 1, String(prov.applied?.productsAdded));
  c('  納品先が1件設定される', prov.applied?.addressesAdded === 1, String(prov.applied?.addressesAdded));
  c('  発注設定が作られる', prov.applied?.settingsCreated === true);
  c('  ログインが発行される', prov.loginCreated === true && prov.login?.email === EMAIL, prov.login?.email);
  c('  パスワードが返る', typeof prov.login?.password === 'string' && prov.login.password.length >= 8);
  c('  案内文にURL・ID・パスワードが入る',
    !!prov.guide?.includes(prov.url) && !!prov.guide?.includes(EMAIL) && !!prov.guide?.includes(prov.login.password));
  userId = prov.login?.userId;

  console.log('\n【顧客側】実際にログインして発注できる状態か');
  if (!anonKey) {
    console.log('  -- 匿名キーが見つからないため省略');
  } else {
    const cli = createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });
    const { error: se } = await cli.auth.signInWithPassword({ email: EMAIL, password: prov.login.password });
    c('発行された情報でログインできる', !se, se?.message ?? '');
    const { data: visible } = await cli.from('customers').select('id, name');
    c('  自社だけが見える', visible?.length === 1 && visible[0].id === customerId, `${visible?.length}件`);
    const { data: prods } = await cli.from('products').select('id, name');
    c('  発注できる商品が見える', prods?.length === 1, `${prods?.length}件`);
    const { data: addrs } = await cli.from('customer_addresses').select('id, label');
    c('  お届け先が見える', addrs?.length === 1, `${addrs?.length}件`);
    await cli.auth.signOut();
  }

  console.log('\n【二重実行】もう一度押しても壊れないか');
  const again = await fetch(`${BASE}/api/customers/${customerId}/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ loginId: LOGIN_ID }),
  });
  const a2 = await again.json();
  c('エラーにならない', again.status === 200, `HTTP ${again.status} ${a2.error ?? ''}`);
  c('  商品は重複追加されない', a2.applied?.productsAdded === 0, String(a2.applied?.productsAdded));
  c('  納品先も重複追加されない', a2.applied?.addressesAdded === 0, String(a2.applied?.addressesAdded));
  c('  パスワードは作り直されない', a2.login?.password === prov.login.password);
  console.log('       ※ 作り直すと、既に顧客へ渡した情報が使えなくなるため');
} catch (e) {
  ng++;
  console.error('\nエラー:', e.message);
} finally {
  if (customerId) {
    await db.from('orders').delete().eq('customer_id', customerId);
    await db.from('customer_addresses').delete().eq('customer_id', customerId);
    await db.from('customer_products').delete().eq('customer_id', customerId);
    await db.from('customer_order_settings').delete().eq('customer_id', customerId);
    await db.from('customer_users').delete().eq('customer_id', customerId);
    await db.from('customers').delete().eq('id', customerId);
    await db.from('order_audit_log').delete().eq('customer_name', NAME);
  }
  if (userId) {
    await db.from('customer_login_secrets').delete().eq('user_id', userId);
    await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    }).catch(() => {});
  }
  const { count } = await db.from('orders').select('id', { count: 'exact', head: true });
  const { count: cc } = await db.from('customers').select('id', { count: 'exact', head: true });
  console.log(`\n後片付け完了（受注 ${count} 件 / 得意先 ${cc} 社）`);
}

console.log(`\n===== 成功 ${ok} / 失敗 ${ng} =====`);
process.exit(ng === 0 ? 0 : 1);
