#!/usr/bin/env node
/**
 * メール冒頭の宛名の検証。
 *
 *   npm run test:greeting
 *
 * 顧客に直接見えるところなので、敬称を間違えないことを機械的に確かめる。
 * lib/email.ts は TypeScript なので、型注釈だけ落として読み込む。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'lib/email.ts'), 'utf8');

// greetingFor と、それが使う HAS_HONORIFIC / flatten だけを取り出して評価する
const pick = (re) => { const m = src.match(re); if (!m) throw new Error(`見つかりません: ${re}`); return m[0]; };
const code = [
  pick(/const HONORIFIC_TAIL = [^\n]+/),
  pick(/function flatten[\s\S]*?\n\}/),
  pick(/export function greetingFor[\s\S]*?\n\}/),
].join('\n')
  .replace(/export /g, '')
  .replace(/\(s: string\)/g, '(s)')
  .replace(/\(customerName: string, recipientLabel: string\)/, '(customerName, recipientLabel)')
  .replace(/\): string \{/g, ') {');

const greetingFor = new Function(`${code}; return greetingFor;`)();

let ok = 0, ng = 0;
const c = (name, got, want) => {
  if (got === want) { ok++; console.log(`  OK   ${name}`); }
  else { ng++; console.log(`  NG   ${name}\n       期待: ${JSON.stringify(want)}\n       実際: ${JSON.stringify(got)}`); }
};

console.log('\n【担当者名あり】');
c('敬称なしで入力 → 様を付ける',
  greetingFor('南総カントリークラブ', '宮崎'), '南総カントリークラブ\n宮崎様');
c('敬称ありで入力 → 様を重ねない',
  greetingFor('南総カントリークラブ', '宮崎様'), '南総カントリークラブ\n宮崎様');
c('前後の空白は落とす',
  greetingFor(' 南総カントリークラブ ', ' 宮崎 '), '南総カントリークラブ\n宮崎様');
c('「ご担当者様」はそのまま',
  greetingFor('株式会社よみうりランド', 'ご担当者様'), '株式会社よみうりランド\nご担当者様');
c('「さん」も敬称として扱う',
  greetingFor('zouk tokyo', '木村さん'), 'zouk tokyo\n木村さん');
c('「殿」も敬称として扱う',
  greetingFor('株式会社 田立屋', '大貫殿'), '株式会社 田立屋\n大貫殿');
c('「各位」に様は付けない',
  greetingFor('ビスポークホテル新宿', 'ご担当者各位'), 'ビスポークホテル新宿\nご担当者各位');

console.log('\n【担当者名なし】');
c('会社名＋御中',
  greetingFor('ネストホテル半蔵門', ''), 'ネストホテル半蔵門 御中');
c('空白だけの入力も未入力とみなす',
  greetingFor('ネストホテル半蔵門', '   '), 'ネストホテル半蔵門 御中');

console.log('\n【個人のお客様】');
c('会社名と担当者名が同じなら1行',
  greetingFor('吉田美恵子', '吉田美恵子'), '吉田美恵子様');
c('敬称込みで同じ場合も1行',
  greetingFor('吉田美恵子', '吉田美恵子様'), '吉田美恵子様');
c('全角空白の違いは無視して同一とみなす',
  greetingFor('吉田　美恵子', '吉田美恵子'), '吉田美恵子様');
c('御中は付かない',
  greetingFor('吉田美恵子', '吉田美恵子').includes('御中'), false);

console.log('\n【実際の得意先名で目視】');
for (const [n, l] of [
  ['南総カントリークラブ', '宮崎様'],
  ['旭化成ホームズ株式会社　デザインスタジオ', ''],
  ['MuAtsu Sleep Lab.本店', '担当者'],
  ['吉田美恵子', '吉田美恵子'],
]) {
  console.log(`\n  得意先「${n}」 担当「${l}」`);
  for (const line of greetingFor(n, l).split('\n')) console.log(`      ${line}`);
}

console.log(`\n  ${ok} OK / ${ng} NG\n`);
process.exit(ng ? 1 : 0);
