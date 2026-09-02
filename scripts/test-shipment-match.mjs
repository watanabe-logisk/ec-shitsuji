#!/usr/bin/env node
/**
 * 出荷実績CSVの読み取りと照合の検証。
 *
 *   npm run test:shipments
 *
 * 番号を取り違えるとA社の追跡番号がB社に届く。曖昧なものを
 * 「決め打ちしない」ことを重点的に確かめる。DBもサーバも要らない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_test_out');
fs.rmSync(OUT, { recursive: true, force: true });
// 検証したい2つのファイルだけを node から読める形に変換する。
// @/lib/... の別名を解決させるため、その場限りの tsconfig を置く
const CONF = path.join(ROOT, '_test_tsconfig.json');
fs.writeFileSync(CONF, JSON.stringify({
  compilerOptions: {
    outDir: OUT, module: 'commonjs', target: 'es2020',
    esModuleInterop: true, skipLibCheck: true,
    baseUrl: '.', paths: { '@/*': ['./*'] },
  },
  files: ['lib/wms.ts', 'lib/shipmentMatch.ts'],
}, null, 2));
try {
  execFileSync('npx', ['tsc', '-p', '_test_tsconfig.json'], { cwd: ROOT, shell: true, stdio: 'pipe' });
} finally {
  fs.rmSync(CONF, { force: true });
}
// tsc は別名をそのまま出力するので、node が読めるよう相対パスに直す
const mp = path.join(OUT, 'shipmentMatch.js');
fs.writeFileSync(mp, fs.readFileSync(mp, 'utf8').replace(/@\/lib\/wms/g, './wms'));

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const wms = require(path.join(OUT, 'wms.js'));
const m = require(mp);

let ok = 0, ng = 0;
const c = (n, v, d = '') => { if (v) { ok++; console.log(`  OK   ${n}`); } else { ng++; console.log(`  NG   ${n}${d ? `  → ${d}` : ''}`); } };

const order = (over = {}) => ({
  id: 'id-' + (over.order_number ?? 'x'), order_number: '260901001',
  customer_id: 'c1', customer_name: '南総カントリークラブ',
  shipping_name: '南総カントリークラブ', shipping_contact: 'ハウス売店',
  shipping_date: '2026-09-01', quantity: 10, status: 'preparing', ...over,
});
const row = (over = {}) => ({
  lineNo: 1, orderNumber: '260901001', trackingNumber: '66435973800',
  shippedOn: '2026-09-01', shipToName: '南総カントリークラブ', raw: {}, ...over,
});

console.log('\n【配送業者の判定】');
c('11桁 → 福山通運', wms.detectCarrier('66435973800') === '福山通運');
c('12桁 → 佐川急便', wms.detectCarrier('123456789012') === '佐川急便');
c('10桁 → 判定しない', wms.detectCarrier('1234567890') === null);
c('13桁 → 判定しない', wms.detectCarrier('1234567890123') === null);
c('空 → 判定しない', wms.detectCarrier('') === null);
c('ハイフン入りでも桁数で判定する', wms.detectCarrier('664-3597-3800') === '福山通運');

console.log('\n【追跡URL】');
const sagawa = wms.trackingInfo('佐川急便', '123456789012');
c('佐川は番号をURLに載せる', sagawa.url.includes('123456789012') && !sagawa.needsManualInput, sagawa.url);
const fuku = wms.trackingInfo('福山通運', '66435973800');
c('福山は入力ページを案内する', fuku.needsManualInput && fuku.url.startsWith('https://'), fuku.url);
c('業者不明ならURLを出さない', wms.trackingInfo('', '1').url === '');

console.log('\n【照合】');
const orders = [order(), order({ order_number: '260901002', id: 'id2', shipping_date: '2026-09-02' })];
c('注文番号が完全一致すれば exact',
  m.findOrderForRow(row(), orders).kind === 'exact');
c('W付きの番号も一致する',
  m.findOrderForRow(row({ orderNumber: 'W260901003' }), [order({ order_number: 'W260901003' })]).kind === 'exact');
c('WMS側が NES-MEG-260901001 でも見つかる',
  m.findOrderForRow(row({ orderNumber: 'NES-MEG-260901001' }), orders).kind === 'contained');
c('見つからなければ none',
  m.findOrderForRow(row({ orderNumber: 'NES-MEG260901' }), orders).kind === 'none');
c('注文番号が空なら none',
  m.findOrderForRow(row({ orderNumber: '' }), orders).kind === 'none');

console.log('\n【取り違えを起こさないこと】');
const dup = [order({ id: 'a' }), order({ id: 'b' })];
c('同じ番号の受注が2件あるときは決め打ちしない',
  m.findOrderForRow(row(), dup).order === null);
const twoContained = [order({ order_number: '260901', id: 'a' }), order({ order_number: '901001', id: 'b' })];
c('含まれる受注が2件あるときも決め打ちしない',
  m.findOrderForRow(row({ orderNumber: 'X260901001' }), twoContained).order === null);
c('短すぎる番号では含まれる判定をしない',
  m.findOrderForRow(row({ orderNumber: 'AB123XY' }), [order({ order_number: '123' })]).kind === 'none');

console.log('\n【取り込みを止める条件】');
c('お問合せ番号が空なら止める',
  m.blockedReason(row({ trackingNumber: '' }), order()) !== null);
c('キャンセル済みの受注には取り込まない',
  m.blockedReason(row(), order({ status: 'cancelled' })) !== null);
c('未一致は止めない（画面で選ぶため）',
  m.blockedReason(row(), null) === null);
c('通常は止めない', m.blockedReason(row(), order()) === null);

console.log('\n【未一致の行に出す候補】');
const pool = [
  order({ id: '1', order_number: '260901001', shipping_name: '南総カントリークラブ', shipping_date: '2026-09-01' }),
  order({ id: '2', order_number: '260901002', shipping_name: 'ネストホテル半蔵門', customer_name: 'ネストホテル半蔵門', shipping_date: '2026-09-01' }),
  order({ id: '3', order_number: '260901003', shipping_name: '南総カントリークラブ', shipping_date: '2026-12-01' }),
  order({ id: '4', order_number: '260901004', shipping_name: '南総カントリークラブ', shipping_date: '2026-09-01', status: 'shipped' }),
];
const cand = m.candidatesForRow(row({ orderNumber: '', shipToName: '南総カントリークラブ' }), pool);
c('発送先名が近いものに絞る', cand.every(o => o.shipping_name === '南総カントリークラブ'), cand.map(o => o.shipping_name).join());
c('得意先名の側が一致しても候補に入る',
  m.candidatesForRow(row({ orderNumber: '', shipToName: '南総カントリークラブ' }),
    [order({ id: '9', shipping_name: 'ハウス売店', customer_name: '南総カントリークラブ' })]).length === 1);
c('出荷済みの受注は候補に出さない', !cand.some(o => o.id === '4'));
c('出荷日が近い順に並ぶ', cand[0]?.id === '1', cand.map(o => o.id).join());
c('株式会社の有無は無視して同じ相手とみなす',
  m.looksLikeSameParty('株式会社 田立屋', '田立屋'));
c('無関係な名前は同じ相手としない',
  !m.looksLikeSameParty('南総カントリークラブ', 'ネストホテル半蔵門'));

console.log('\n【実物のCSV】');
const CSV = 'C:/Users/watan/Downloads/出荷実績(注文単位).csv';
if (fs.existsSync(CSV)) {
  const rows = wms.parseShipmentCsv(fs.readFileSync(CSV));
  c('Shift_JISのまま読める', rows.length === 1 && rows[0].shipToName.includes('ネストホテル'), JSON.stringify(rows[0]?.shipToName));
  c('お問合せ番号が取れる', rows[0].trackingNumber === '66435973800');
  c('出荷日を日付にできる', rows[0].shippedOn === '2026-09-01');
} else {
  console.log('  --   実物のCSVが見つからないため省略');
}
try {
  wms.parseShipmentCsv(Buffer.from('あ,い,う\n1,2,3', 'utf8'));
  c('列が違うCSVは受け付けない', false, 'エラーにならなかった');
} catch (e) {
  c('列が違うCSVは受け付けない', /注文番号/.test(e.message), e.message);
}

fs.rmSync(OUT, { recursive: true, force: true });
console.log(`\n  ${ok} OK / ${ng} NG\n`);
process.exit(ng ? 1 : 0);
