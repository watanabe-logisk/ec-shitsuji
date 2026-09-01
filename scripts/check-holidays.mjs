#!/usr/bin/env node
/**
 * 管理アプリと顧客アプリの自社休業日が一致しているか確認する。
 *
 *   npm run check:holidays
 *
 * 2つのアプリは別リポジトリなので、休業日の定義を共有できず同じ値を
 * 2箇所に持っている。片方だけ直すと「顧客は選べないのに管理側は
 * 出荷日として計算する」という食い違いが静かに起きるため、
 * 休業日を変更したら必ずこれを実行すること。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  { name: '管理アプリ', file: path.join(ROOT, 'lib/shipping.ts') },
  { name: '顧客アプリ', file: path.resolve(ROOT, '../aquajacket-order/lib/orderRules.ts') },
];

/** COMPANY_HOLIDAYS の配列リテラルから日付文字列を取り出す */
function extract(file) {
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/COMPANY_HOLIDAYS:\s*string\[\]\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return null;
  return [...m[1].matchAll(/'([0-9-]+)'/g)].map(x => x[1]);
}

const results = FILES.map(f => ({ ...f, list: extract(f.file) }));
let failed = false;

for (const r of results) {
  if (r.list === null) {
    console.log(`  NG   ${r.name}: COMPANY_HOLIDAYS を読み取れません`);
    console.log(`       ${r.file}`);
    failed = true;
  } else {
    console.log(`  ${r.name}: ${r.list.join(', ')}`);
  }
}

if (!failed) {
  const [a, b] = results;
  const sa = [...a.list].sort().join('|');
  const sb = [...b.list].sort().join('|');
  console.log();
  if (sa === sb) {
    console.log(`  OK   両アプリの休業日が一致しています（${a.list.length}日）`);
  } else {
    failed = true;
    const onlyA = a.list.filter(x => !b.list.includes(x));
    const onlyB = b.list.filter(x => !a.list.includes(x));
    console.log('  NG   休業日が食い違っています');
    if (onlyA.length) console.log(`       ${a.name}にだけある: ${onlyA.join(', ')}`);
    if (onlyB.length) console.log(`       ${b.name}にだけある: ${onlyB.join(', ')}`);
    console.log('\n       どちらかに合わせて両方を同じ内容にしてください。');
  }
}

process.exit(failed ? 1 : 0);
