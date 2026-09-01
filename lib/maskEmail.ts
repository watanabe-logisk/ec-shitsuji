/**
 * 画面上でメールアドレスの一部を伏せる。
 *
 * 目的は、管理画面を開いたまま席を立ったり、誰かに画面を見せたりしたときに
 * 顧客のアドレスがそのまま読まれないようにすること。
 * 管理画面に入れる人からは「表示」ボタンで元に戻せるので、
 * 権限の制御ではなく、あくまで見た目の話であることに注意。
 *
 *   tanaka@example.co.jp  ->  ta***@e***.co.jp
 *
 * 伏せ字は常に3文字にしている。隠した文字数どおりに並べると
 * アドレスの長さが分かってしまうため。
 */

const HIDDEN = '***'

/** ドメインは会社が分かる末尾だけ残す。example.co.jp -> e***.co.jp */
function maskDomain(domain: string): string {
  const parts = domain.split('.')
  if (parts.length < 2) return HIDDEN

  // co.jp / ne.jp のように末尾が2階層のものは2つ残す
  const keep = parts.length >= 3 && parts[parts.length - 2].length <= 3 ? 2 : 1
  const head = parts.slice(0, parts.length - keep)
  const tail = parts.slice(parts.length - keep).join('.')

  if (head.length === 0) return domain
  return `${head[0].slice(0, 1)}${HIDDEN}.${tail}`
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  // 形式が想定外のものは、判断がつかないので全部伏せる
  if (at <= 0 || at === email.length - 1) return HIDDEN

  const local = email.slice(0, at)
  const domain = email.slice(at + 1)

  // 2文字までのアドレスで先頭2文字を出すと全部見えてしまう
  const shown = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2)

  return `${shown}${HIDDEN}@${maskDomain(domain)}`
}
