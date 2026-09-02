import iconv from 'iconv-lite'

/**
 * 倉庫の WMS から落とす「出荷実績（注文単位）」CSV の読み取り。
 *
 * lib/csv.ts で出したCSVの1列目（注文番号）が WMS に取り込まれ、
 * 出荷が終わると同じ番号がこのCSVに戻ってくる。だから注文番号で照合できる。
 *
 * 文字コードは Shift_JIS。全項目がダブルクォートで囲まれている。
 * 実際のファイルで確認した並びは以下（16列）:
 *
 *   出荷日 / 注文番号 / 注文者氏名 / お問合せ番号 / 代引金額合計 /
 *   注文商品点数 / 発送元情報 / 決済方法 / 代引ステータス / 送料サイズ /
 *   発送日 / 都道府県 / 便種 / 個数 / 発送先名 / メールアドレス
 *
 * ただし列の順番に依存すると、WMS側の変更で黙って壊れる。
 * ヘッダー名で引くようにしている。
 */

export type ShipmentRow = {
  /** CSVの何行目か（ヘッダーを除いた1始まり）。画面で行を示すのに使う */
  lineNo: number
  orderNumber: string
  trackingNumber: string
  shippedOn: string | null   // 'YYYY-MM-DD'
  shipToName: string
  /** 取り込んだ行そのまま。後から元を確認できるように残す */
  raw: Record<string, string>
}

/** 必ず要る列。これが無いCSVは別物なので、その場で止める */
const REQUIRED = ['注文番号', 'お問合せ番号']

export class WmsCsvError extends Error {}

/** 1行をCSVとして分解する。値の中のカンマと "" に対応する */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }   // "" はエスケープされた "
        else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur); cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** '20260901 10:32' / '2026/09/01' / '20260901' を 'YYYY-MM-DD' にする */
export function parseWmsDate(value: string): string | null {
  const s = value.trim()
  if (!s) return null

  const compact = s.match(/^(\d{4})(\d{2})(\d{2})/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`

  const slashed = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (slashed) {
    const mm = slashed[2].padStart(2, '0')
    const dd = slashed[3].padStart(2, '0')
    return `${slashed[1]}-${mm}-${dd}`
  }
  return null
}

export function parseShipmentCsv(buffer: Buffer): ShipmentRow[] {
  const text = iconv.decode(buffer, 'Shift_JIS')
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length === 0) throw new WmsCsvError('ファイルが空です。')

  const headers = splitCsvLine(lines[0]).map(h => h.trim())
  const missing = REQUIRED.filter(r => headers.indexOf(r) < 0)
  if (missing.length > 0) {
    throw new WmsCsvError(
      `このCSVには「${missing.join('」「')}」の列がありません。` +
      `WMSの「出荷実績（注文単位）」を選んでダウンロードしたファイルか確認してください。`,
    )
  }

  const rows: ShipmentRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i])
    const raw: Record<string, string> = {}
    for (let c = 0; c < headers.length; c++) raw[headers[c]] = (values[c] ?? '').trim()

    const orderNumber = raw['注文番号'] ?? ''
    const trackingNumber = (raw['お問合せ番号'] ?? '').replace(/[\s-]/g, '')

    // 番号がどちらも無い行は集計行や空行。黙って飛ばす
    if (!orderNumber && !trackingNumber) continue

    rows.push({
      lineNo: rows.length + 1,
      orderNumber,
      trackingNumber,
      shippedOn: parseWmsDate(raw['出荷日'] ?? '') ?? parseWmsDate(raw['発送日'] ?? ''),
      shipToName: raw['発送先名'] || raw['注文者氏名'] || '',
      raw,
    })
  }

  if (rows.length === 0) throw new WmsCsvError('取り込める行がありませんでした。')
  return rows
}

// ---------------------------------------------------------------------------
// 配送業者
// ---------------------------------------------------------------------------

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
  const digits = trackingNumber.replace(/\D/g, '')
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
