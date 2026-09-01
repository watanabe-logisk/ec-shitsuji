/**
 * 営業日・休業日の判定の検証。
 * lib/shipping.ts をそのまま読み込むので、実装とテストがズレない。
 *
 *   npm run test:holidays
 */
import {
  COMPANY_HOLIDAYS,
  isBusinessDay,
  isCompanyHoliday,
  alertDateISO,
  subtractBusinessDays,
} from '../lib/shipping'

let passed = 0, failed = 0
const check = (n: string, ok: boolean, d = '') => {
  if (ok) { passed++; console.log(`  OK   ${n}`) }
  else { failed++; console.log(`  NG   ${n}${d ? `  → ${d}` : ''}`) }
}
const W = ['日','月','火','水','木','金','土']
const D = (s: string) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d) }
const lbl = (s: string) => `${s}(${W[D(s).getDay()]})`

console.log('\n【国民の祝日】2026年9月のシルバーウィーク')
for (const [d, want, why] of [
  ['2026-09-18', true,  '平日(金)'],
  ['2026-09-19', false, '土曜'],
  ['2026-09-21', false, '敬老の日'],
  ['2026-09-22', false, '休日'],
  ['2026-09-23', false, '秋分の日'],
  ['2026-09-24', true,  '平日(木)'],
] as [string, boolean, string][]) {
  check(`${lbl(d)} ${why} は ${want ? '営業日' : '休業日'}`, isBusinessDay(D(d)) === want)
}

console.log('\n【自社休業日】年末年始 12/29〜1/3')
check(`設定は ${COMPANY_HOLIDAYS.length} 日`, COMPANY_HOLIDAYS.length === 6, COMPANY_HOLIDAYS.join(','))
for (const [d, want] of [
  ['2026-12-28', false], ['2026-12-29', true], ['2026-12-31', true],
  ['2027-01-03', true],  ['2027-01-04', false],
] as [string, boolean][]) {
  check(`${lbl(d)} は自社休業日 ${want ? 'である' : 'ではない'}`, isCompanyHoliday(D(d)) === want)
}
check('自社休業日は営業日にならない', !isBusinessDay(D('2026-12-30')))
check('年をまたいでも効く（1/2は翌年扱い）', !isBusinessDay(D('2027-01-02')))

console.log('\n【出荷アラート日】連休をまたぐと前倒しになる')
check('9/24(木)納品 → 9/17(木)', alertDateISO('2026-09-24') === '2026-09-17', alertDateISO('2026-09-24'))
check('  シルバーウィーク当日(9/22)より前になっている', alertDateISO('2026-09-24') < '2026-09-21')
check('1/5(火)納品 → 12/28(月)', alertDateISO('2027-01-05') === '2026-12-28', alertDateISO('2027-01-05'))
check('  年末年始休業(12/29-1/3)より前になっている', alertDateISO('2027-01-05') < '2026-12-29')

console.log('\n【連休が無ければ従来どおり】')
check('9/4(金)納品 → 9/2(水)', alertDateISO('2026-09-04') === '2026-09-02', alertDateISO('2026-09-04'))
check('9/8(火)納品 → 9/4(金)（土日をまたぐ）', alertDateISO('2026-09-08') === '2026-09-04', alertDateISO('2026-09-08'))

console.log('\n【延長日数】')
check('9/24納品 +3日 → 9/14(月)', alertDateISO('2026-09-24', 3) === '2026-09-14', alertDateISO('2026-09-24', 3))

console.log('\n【アラート日は必ず営業日】今後2年ぶんを総当たり')
const bad: string[] = []
for (let i = 0; i < 730; i++) {
  const d = new Date(2026, 8, 1); d.setDate(d.getDate() + i)
  const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  for (const extra of [0, 5, 10]) {
    if (!isBusinessDay(subtractBusinessDays(s, 2 + extra))) bad.push(`${s}+${extra}`)
  }
}
check('730日 × 延長3パターンすべてで営業日', bad.length === 0, bad.slice(0, 3).join(', '))

console.log(`\n===== 成功 ${passed} / 失敗 ${failed} =====`)
process.exit(failed === 0 ? 0 : 1)
