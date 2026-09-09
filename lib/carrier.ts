/**
 * 配送業者の判定と追跡ページ。
 *
 * lib/wms.ts から切り出している。あちらは Shift_JIS 変換に iconv-lite を
 * 使っており Node 専用だが、ここの内容はブラウザ側の画面からも使う。
 * 一緒にしておくと、画面が Node 専用のライブラリを読み込んでしまう。
 */

export const CARRIERS = ['福山通運', '佐川急便'] as const
export type Carrier = (typeof CARRIERS)[number]

/**
 * お問合せ番号の桁数から配送業者を決める。
 *
 * WMSのCSVには便種（配送業者）の列があるが、実際のファイルでは空だった。
 * AQUA JACKET が使うのはこの2社だけで、桁数が違うため区別できる。
 *   福山通運 11桁 / 佐川急便 12桁
 *
 * これ以外の桁数は判定しない。業者を増やしたときに黙って誤判定するより、
 * 画面で選んでもらうほうが安全。
 */
export function detectCarrier(trackingNumber: string): Carrier | null {
  const digits = (trackingNumber ?? '').replace(/\D/g, '')
  if (digits.length === 11) return '福山通運'
  if (digits.length === 12) return '佐川急便'
  return null
}

/**
 * 追跡ページ。
 *
 * 佐川は番号をURLに載せられるので、顧客はリンクを開くだけで結果が出る。
 * 福山は番号を渡せる公開URLが見つからなかったため、入力ページを案内して
 * 番号は手で入れてもらう。メール本文もその前提で文言を分けている。
 */
export function trackingInfo(carrier: string, trackingNumber: string): {
  url: string
  needsManualInput: boolean
} {
  if (carrier === '佐川急便') {
    return {
      url: `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${encodeURIComponent(trackingNumber)}`,
      needsManualInput: false,
    }
  }
  if (carrier === '福山通運') {
    return { url: 'https://corp.fukutsu.co.jp/corp/recieve/', needsManualInput: true }
  }
  return { url: '', needsManualInput: true }
}
