import { supabase } from '@/lib/supabase'
import { sendPreparingMail } from '@/lib/notifyCustomer'

/**
 * 受注を「準備中」へ進め、顧客へ出荷準備のメールを送る。
 *
 * 呼び出し元は2つある。
 *   - CSV出力（倉庫へ出荷指示を渡した時点）
 *   - 受注一覧の「準備中にする」
 * どちらも同じ結果になるよう、ここに集めている。片方だけ直すと、
 * 操作によって顧客に届く内容が変わってしまう。
 *
 * 進めるのは pending / confirmed のみ。理由:
 *   - cancelled を巻き戻すと、キャンセル済みが準備中として復活してしまう
 *   - shipped / completed を再出力したときに状態が逆戻りしてしまう
 *   - 既に preparing のものを再送すると、顧客に同じメールが二度届く
 */
export const ADVANCEABLE = ['pending', 'confirmed']

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** '2026-09-17' → '2026年9月17日(木)' */
export function formatDateJpFull(iso: string): string {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso ?? ''
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const w = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]
  return `${y}年${mo}月${d}日(${w})`
}

export type PrepareResult = {
  /** 実際に準備中へ進んだ受注 */
  advanced: { orderNumber: string; customerName: string; mailMessage: string }[]
  /** 対象外だったもの（既に準備中・出荷済み・キャンセルなど） */
  skipped: { orderNumber: string; status: string }[]
  error: string | null
}

export async function advanceToPreparing(ids: string[]): Promise<PrepareResult> {
  const result: PrepareResult = { advanced: [], skipped: [], error: null }
  if (!ids || ids.length === 0) return result

  const { data: before, error: readError } = await supabase
    .from('orders')
    .select('id, order_number, customer_id, customer_name, product_name, quantity, shipping_name, shipping_contact, shipping_date, time_slot, status')
    .in('id', ids)

  if (readError) {
    result.error = readError.message
    return result
  }

  const rows = before ?? []
  const targets = rows.filter(o => ADVANCEABLE.indexOf(o.status) >= 0)
  for (const o of rows.filter(o => ADVANCEABLE.indexOf(o.status) < 0)) {
    result.skipped.push({ orderNumber: o.order_number, status: o.status })
  }
  if (targets.length === 0) return result

  // 状態を先に確定させる。メールの成否に関わらず、進んだ事実は残す
  const { error: updateError } = await supabase
    .from('orders')
    .update({ status: 'preparing' })
    .in('id', targets.map(o => o.id))
    .in('status', ADVANCEABLE)   // 読んでから更新するまでの間に変わっていた場合の保険

  if (updateError) {
    result.error = updateError.message
    return result
  }

  for (const o of targets) {
    const mail = await sendPreparingMail({
      orderId: o.id,
      orderNumber: o.order_number,
      customerId: o.customer_id,
      customerName: (o.customer_name ?? '').trim(),
      productName: o.product_name ?? '',
      quantity: o.quantity ?? 0,
      addressLabel: o.shipping_name ?? '',
      contactName: o.shipping_contact ?? '',
      deliveryDateLabel: formatDateJpFull(o.shipping_date),
      timeSlot: o.time_slot ?? '指定無し',
    })
    result.advanced.push({
      orderNumber: o.order_number,
      customerName: (o.customer_name ?? '').trim(),
      mailMessage: mail.message,
    })
  }

  return result
}
