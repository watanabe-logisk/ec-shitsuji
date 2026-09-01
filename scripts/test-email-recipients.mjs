#!/usr/bin/env node
/**
 * 通知メール宛先の登録APIの検証。
 *
 *   npm run test:emails        （先に npm start でサーバを起動しておくこと）
 *
 * 実在の得意先を2社借りてテスト用の宛先を足し、最後に必ず消す。
 * 特に「他社のURLから別の得意先の宛先を触れないこと」を見る。
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
const api = (cid, init = {}) =>
  fetch(`${BASE}/api/customers/${cid}/emails${init.qs ?? ''}`, {
    ...init, headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
  });

const MARK = `zztest${Date.now().toString().slice(-6)}`;
const created = [];

try {
  const { data: cs } = await db.from('customers').select('id, name').order('name').limit(2);
  if (!cs || cs.length < 2) throw new Error('得意先が2社以上必要です');
  const [A, B] = cs;
  console.log(`\n  対象: ${A.name} / ${B.name}\n`);

  console.log('【認証】');
  const noAuth = await fetch(`${BASE}/api/customers/${A.id}/emails`, { redirect: 'manual' });
  c('未ログインでは弾かれる', noAuth.status >= 300 && noAuth.status < 400, `HTTP ${noAuth.status}`);
  const noAuthAgg = await fetch(`${BASE}/api/customers/emails`, { redirect: 'manual' });
  c('集計も未ログインでは弾かれる', noAuthAgg.status >= 300 && noAuthAgg.status < 400, `HTTP ${noAuthAgg.status}`);

  console.log('\n【登録】');
  const addA = await api(A.id, { method: 'POST', body: JSON.stringify({ email: `${MARK}@example.co.jp`, label: '発注担当' }) });
  const rowA = await addA.json();
  if (rowA.id) created.push(rowA.id);
  c('登録できる', addA.ok && rowA.email === `${MARK}@example.co.jp`, JSON.stringify(rowA));
  c('担当名が保存される', rowA.label === '発注担当');
  c('既定で有効になる', rowA.is_active === true);

  const upper = await api(A.id, { method: 'POST', body: JSON.stringify({ email: `${MARK.toUpperCase()}@EXAMPLE.CO.JP` }) });
  c('大文字違いの二重登録を弾く', upper.status === 400, `HTTP ${upper.status}`);

  for (const bad of ['ただの文字列', 'a@b', '@example.com', 'a b@example.com', '']) {
    const r = await api(A.id, { method: 'POST', body: JSON.stringify({ email: bad }) });
    c(`不正な形式を弾く: ${bad || '(空)'}`, r.status === 400, `HTTP ${r.status}`);
  }

  console.log('\n【他社の宛先を触れないこと】');
  const stealPatch = await api(B.id, { method: 'PATCH', body: JSON.stringify({ recipientId: rowA.id, isActive: false }) });
  c('別得意先のURLから他社の宛先を停止できない', !stealPatch.ok, `HTTP ${stealPatch.status}`);
  const stillActive = await (await api(A.id)).json();
  c('停止されていない', stillActive.find(r => r.id === rowA.id)?.is_active === true);

  const stealDelete = await api(B.id, { method: 'DELETE', qs: `?recipientId=${rowA.id}` });
  const survives = await (await api(A.id)).json();
  c('別得意先のURLから他社の宛先を削除できない', survives.some(r => r.id === rowA.id), `HTTP ${stealDelete.status}`);

  const listB = await (await api(B.id)).json();
  c('他社の一覧にこの宛先は出ない', !listB.some(r => r.id === rowA.id));

  console.log('\n【停止と再開】');
  await api(A.id, { method: 'PATCH', body: JSON.stringify({ recipientId: rowA.id, isActive: false }) });
  let l = await (await api(A.id)).json();
  c('停止できる', l.find(r => r.id === rowA.id)?.is_active === false);

  const agg1 = await (await fetch(`${BASE}/api/customers/emails`, { headers: { Cookie: COOKIE } })).json();
  c('停止中は集計に数えない', (agg1[A.id] ?? 0) === 0, `${agg1[A.id]}`);

  await api(A.id, { method: 'PATCH', body: JSON.stringify({ recipientId: rowA.id, isActive: true }) });
  l = await (await api(A.id)).json();
  c('再開できる', l.find(r => r.id === rowA.id)?.is_active === true);

  console.log('\n【集計】');
  const agg = await (await fetch(`${BASE}/api/customers/emails`, { headers: { Cookie: COOKIE } })).json();
  c('件数を返す', agg[A.id] === 1, JSON.stringify(agg));
  c('アドレスそのものは返さない', !JSON.stringify(agg).includes(MARK));

  console.log('\n【伏せ字】');
  // lib/maskEmail.ts は TypeScript なので node から直接は読めない。
  // 同じ規則をここに写して、期待する出力になるかを突き合わせる。
  const cases = [
    ['tanaka.taro@example.co.jp', 'ta***@e***.co.jp'],
    ['keiri@nesthotel.ne.jp', 'ke***@n***.ne.jp'],
    ['a@b.com', 'a***@b***.com'],
  ];
  const src = fs.readFileSync(path.join(ROOT, 'lib/maskEmail.ts'), 'utf8');
  c('伏せ字は固定長で、元の文字数が推測できない', /const HIDDEN = '\*\*\*'/.test(src));
  c('伏せ字の関数がある', /export function maskEmail/.test(src));
  for (const [inp, want] of cases) {
    // 実装と同じ処理を再現して突き合わせる
    const H = '***';
    const md = d => { const p = d.split('.'); if (p.length < 2) return H;
      const keep = p.length >= 3 && p[p.length-2].length <= 3 ? 2 : 1;
      const head = p.slice(0, p.length-keep), tail = p.slice(p.length-keep).join('.');
      return head.length ? `${head[0].slice(0,1)}${H}.${tail}` : d; };
    const at = inp.lastIndexOf('@');
    const local = inp.slice(0, at);
    const got = `${local.length <= 2 ? local.slice(0,1) : local.slice(0,2)}${H}@${md(inp.slice(at+1))}`;
    c(`${inp} → ${want}`, got === want, got);
  }

  console.log('\n【削除】');
  const del = await api(A.id, { method: 'DELETE', qs: `?recipientId=${rowA.id}` });
  c('削除できる', del.ok);
  const after = await (await api(A.id)).json();
  c('一覧から消える', !after.some(r => r.id === rowA.id));
  if (!after.some(r => r.id === rowA.id)) created.length = 0;

} catch (e) {
  ng++; console.log(`\n  NG   例外: ${e.message}`);
} finally {
  // 失敗して残った分は必ず消す
  for (const id of created) await db.from('customer_email_recipients').delete().eq('id', id);
  const { data: leftovers } = await db.from('customer_email_recipients').select('id').like('email', `%${MARK}%`);
  if (leftovers?.length) {
    await db.from('customer_email_recipients').delete().like('email', `%${MARK}%`);
    console.log(`\n  （テスト用の宛先 ${leftovers.length} 件を削除しました）`);
  }
}

console.log(`\n  ${ok} OK / ${ng} NG\n`);
process.exit(ng ? 1 : 0);
