import holidayJp from '@holiday-jp/holiday_jp'

/** 出荷アラートの基準リードタイム（営業日）。延長日数はこれに加算される */
export const ALERT_BASE_BUSINESS_DAYS = 2

/** フォームで選べる延長日数 */
export const ALERT_EXTRA_DAY_OPTIONS = [0, 1, 2, 3, 4, 5, 7, 10]

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

/**
 * 出荷できる日か。土日と国民の祝日は出荷しない。
 *
 * 路線便を使っており、土日祝は集荷も配達も動かない。
 * 以前は土日しか見ていなかったため、祝日をはさむとアラートが実際の
 * 出荷期限より後に出てしまい、間に合わない注文を見逃す可能性があった。
 */
export function isBusinessDay(date: Date): boolean {
  const d = date.getDay()
  if (d === 0 || d === 6) return false
  // holiday_jp は年月日をローカル時刻で読むので、そのまま Date を渡してよい
  return !holidayJp.isHoliday(date)
}

/** 土日祝を飛ばして days 営業日ぶん遡った日付を返す */
export function subtractBusinessDays(dateStr: string, days: number): Date {
  const date = new Date(dateStr)
  let subtracted = 0
  // 連休が続いても必ず抜けられるよう上限を設ける
  for (let i = 0; i < 3650 && subtracted < days; i++) {
    date.setDate(date.getDate() - 1)
    if (isBusinessDay(date)) subtracted++
  }
  return date
}

/** 配送指定日からアラート発火日（＝出荷予定日）を求める */
export function alertDate(shippingDate: string, extraDays = 0): Date | null {
  if (!shippingDate) return null
  return subtractBusinessDays(shippingDate, ALERT_BASE_BUSINESS_DAYS + extraDays)
}

/** 'yyyy-MM-dd' 形式。日付比較に使う */
export function alertDateISO(shippingDate: string, extraDays = 0): string {
  const d = alertDate(shippingDate, extraDays)
  if (!d) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 'M/D(曜)' 形式。画面表示に使う */
export function alertDateLabel(shippingDate: string, extraDays = 0): string {
  const d = alertDate(shippingDate, extraDays)
  if (!d) return ''
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_LABELS[d.getDay()]})`
}
