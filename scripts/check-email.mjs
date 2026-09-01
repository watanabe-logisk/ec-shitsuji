#!/usr/bin/env node
/**
 * 2つのアプリのメール文面が一致しているか確認する。
 *
 *   npm run check:email
 *
 * lib/email.ts は別リポジトリ同士で共有できないため同じものを2箇所に持っている。
 * 片方だけ直すと、Web発注と管理画面からの登録で顧客に届く文面が変わってしまう。
 * 文面を触ったら必ずこれを実行すること。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  { name: '管理アプリ', file: path.join(ROOT, 'lib/email.ts') },
  { name: '発注アプリ', file: path.resolve(ROOT, '../aquajacket-order/lib/email.ts') },
];

/**
 * コメントと空白を除いた本体で比較する。
 * 「★ ○○アプリと同じ内容にすること」の相手先の名前だけは必ず異なるため、
 * そこだけで不一致になるのを避ける。
 */
function normalize(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // ブロックコメント
    .replace(/\/\/.*$/gm, '')           // 行コメント
    .replace(/\s+/g, ' ')
    .trim();
}

let failed = false;
const hashes = [];

for (const f of FILES) {
  if (!fs.existsSync(f.file)) {
    console.log(`  NG   ${f.name}: ファイルがありません`);
    console.log(`       ${f.file}`);
    failed = true;
    continue;
  }
  const src = fs.readFileSync(f.file, 'utf8');
  const body = normalize(src);
  hashes.push({ ...f, body, hash: crypto.createHash('sha256').update(body).digest('hex').slice(0, 12) });
  console.log(`  ${f.name}: ${src.split(/\r?\n/).length} 行  (${hashes[hashes.length - 1].hash})`);
}

if (!failed && hashes.length === 2) {
  console.log();
  if (hashes[0].hash === hashes[1].hash) {
    console.log('  OK   2つのアプリのメール文面は一致しています');
  } else {
    failed = true;
    console.log('  NG   メール文面が食い違っています');
    // どこが違うか当たりを付けられるよう、件名の行だけ抜き出して見せる
    for (const h of hashes) {
      const subjects = [...fs.readFileSync(h.file, 'utf8').matchAll(/subject:\s*`([^`]*)`/g)].map(m => m[1]);
      console.log(`       ${h.name}の件名: ${subjects.join(' / ') || '(見つからず)'}`);
    }
    console.log('\n       どちらかに合わせて両方を同じ内容にしてください。');
  }
}

process.exit(failed ? 1 : 0);
