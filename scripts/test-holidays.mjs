#!/usr/bin/env node
/**
 * 土日祝を営業日から外したことの検証。DBもサーバーも使わず、計算だけを確かめる。
 *   node scripts/test-holidays.mjs
 */
import holidayJp from '@holiday-jp/holiday_jp';

let passed = 0, failed = 0;
const check = (n, ok, d = '') => {
  if (ok) { passed++; console.log(`  OK   ${n}`); }
  else { failed++; console.log(`  NG   ${n}${d ? `  → ${d}` : ''}`); }
};
const W = ['日','月','火','水','木','金','土'];
const dow = s => { const [y,m,d]=s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)).getUTCDay(); };
const lbl = s => `${s}(${W[dow(s)]})`;

// lib/shipping.ts と同じ実装
function isBusinessDay(date) {
  const d = date.getDay();
  if (d === 0 || d === 6) return false;
  return !holidayJp.isHoliday(date);
}
function subtractBusinessDays(dateStr, days) {
  const date = new Date(dateStr);
  let subtracted = 0;
  for (let i = 0; i < 3650 && subtracted < days; i++) {
    date.setDate(date.getDate() - 1);
    if (isBusinessDay(date)) subtracted++;
  }
  return date;
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const alertISO = (sd, extra=0) => iso(subtractBusinessDays(sd, 2 + extra));

console.log('\n【祝日の判定】2026年9月のシルバーウィーク');
for (const [d, want, name] of [
  ['2026-09-21', false, '敬老の日'],
  ['2026-09-22', false, '休日'],
  ['2026-09-23', false, '秋分の日'],
  ['2026-09-24', true,  '平日(木)'],
  ['2026-09-19', false, '土曜'],
  ['2026-09-18', true,  '平日(金)'],
]) {
  const [y,m,dd] = d.split('-').map(Number);
  check(`${lbl(d)} ${name} は ${want ? '営業日' : '休業日'}`, isBusinessDay(new Date(y,m-1,dd)) === want);
}

console.log('\n【出荷アラート日】連休をまたぐと前倒しになる');
// 9/24(木)納品 → 2営業日前。9/23(水)9/22(火)9/21(月)は祝日、9/20 9/19 は土日 → 9/17(木)
check('9/24(木)納品 → アラートは 9/17(木)', alertISO('2026-09-24') === '2026-09-17', alertISO('2026-09-24'));
// 土日しか見ない旧実装なら 9/22(火) になっていた
check('  旧実装(土日のみ)の 9/22 より 5日早い', alertISO('2026-09-24') < '2026-09-22');

console.log('\n【出荷アラート日】連休が無ければ従来どおり');
check('9/4(金)納品 → アラートは 9/2(水)', alertISO('2026-09-04') === '2026-09-02', alertISO('2026-09-04'));
check('9/8(火)納品 → アラートは 9/4(金)（土日をまたぐ）', alertISO('2026-09-08') === '2026-09-04', alertISO('2026-09-08'));

console.log('\n【延長日数】');
// 9/24納品 + 延長3日 = 5営業日前
check('9/24納品 +3日 → 9/14(月)', alertISO('2026-09-24', 3) === '2026-09-14', alertISO('2026-09-24', 3));

console.log('\n【年末年始】');
// 2027-01-01(金)は元日で祝日、01-02(土) 01-03(日)は週末、01-04(月)は平日。
// この計算は国民の祝日しか見ないため、自社の年末年始休業は考慮されない。
check('2027-01-05(火)納品 → 2026-12-31(木)', alertISO('2027-01-05') === '2026-12-31', alertISO('2027-01-05'));
check('  1/4(月)は祝日ではないので営業日扱い', isBusinessDay(new Date(2027, 0, 4)) === true);
check('  12/31(木)も祝日ではないので営業日扱い', isBusinessDay(new Date(2026, 11, 31)) === true);
console.log('       ※ 年末年始の自社休業日はこの計算に含まれていません。');
console.log('         顧客用アプリ側には COMPANY_HOLIDAYS があり、両者で判定がズレます。');

console.log('\n【アラート日は必ず営業日になる】今後1年ぶんを総当たり');
let bad = [];
for (let i = 0; i < 365; i++) {
  const d = new Date(2026, 8, 1); d.setDate(d.getDate() + i);
  const s = iso(d);
  const a = subtractBusinessDays(s, 2);
  if (!isBusinessDay(a)) bad.push(`${s}→${iso(a)}`);
}
check('365日すべてでアラート日が営業日', bad.length === 0, bad.slice(0,3).join(', '));

console.log(`\n===== 成功 ${passed} / 失敗 ${failed} =====`);
process.exit(failed === 0 ? 0 : 1);
