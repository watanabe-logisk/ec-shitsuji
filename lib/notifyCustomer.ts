import { supabase } from '@/lib/supabase'
import { buildShippedMail, sendEmail } from '@/lib/email'
import { trackingInfo } from '@/lib/wms'

/**
 * 顧客への発送完了メールを送り、結果を email_log に残す。
 *
 * 発注アプリ側の同名ファイル（受付メール）と同じ考え方。
 * 例外を投げない。メールが送れなかったせいで出荷の取り込みまで
 * 失敗するのは本末転倒なので、呼び出し側は結果を見て表示するだけでよい。
 * ただし送れなかったことに気付けないのが最も危険なため、成否は必ず記録する。
 */

export type ShippedMailInput = {
  orderId: string
  orderNumber: string
  customerId: string | null
  customerName: string
  productName: string
  quantity: number
  addressLabel: string
  contactName: string
  deliveryDateLabel: string
  timeSlot: string
  carrier: string
  trackingNumber: string
}

export type NotifyResult = {
  sent: number
  failed: number
  skipped: number
  noRecipients: boolean
  /** 画面にそのまま出せる一言 */
  message: string
}

export async function sendShippedMail(input: ShippedMailInput): Promise<NotifyResult> {
  const none = (message: string): NotifyResult =>
    ({ sent: 0, failed: 0, skipped: 0, noRecipients: true, message })

  try {
    if (!input.customerId) return none('得意先が特定できないため送信しませんでした')

    const { data: recipients, error } = await supabase
      .from('customer_email_recipients')
      .select('email, label')
      .eq('customer_id', input.customerId)
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      console.error('[mail] 宛先の取得に失敗しました', error)
      return none('宛先の取得に失敗しました')
    }

    const list = recipients ?? []
    if (list.length === 0) return none('通知先が未登録のため送信しませんでした')

    const track = trackingInfo(input.carrier, input.trackingNumber)

    let sent = 0, failed = 0, skipped = 0
    for (const r of list) {
      // 宛名は宛先ごとに変わるため使い回さず1件ずつ組み立てる
      const { subject, body } = buildShippedMail({
        customerName: input.customerName,
        recipientLabel: r.label ?? '',
        orderNumber: input.orderNumber,
        productName: input.productName,
        quantity: input.quantity,
        addressLabel: input.addressLabel,
        contactName: input.contactName,
        deliveryDateLabel: input.deliveryDateLabel,
        timeSlot: input.timeSlot,
        carrierName: input.carrier,
        trackingNumber: input.trackingNumber,
        trackingUrl: track.url,
        needsManualInput: track.needsManualInput,
      })

      const result = await sendEmail(r.email, subject, body)
      const wasSkipped = result.ok && 'skipped' in result && result.skipped === true
      if (result.ok && !wasSkipped) sent++
      else if (wasSkipped) skipped++
      else failed++

      await supabase.from('email_log').insert({
        order_id: input.orderId,
        order_number: input.orderNumber,
        customer_id: input.customerId,
        customer_name: input.customerName,
        kind: 'shipped',
        to_email: r.email,
        subject,
        body,
        status: result.ok ? (wasSkipped ? 'skipped' : 'sent') : 'failed',
        error: result.ok ? null : result.error.slice(0, 500),
        provider_id: result.ok && !wasSkipped ? result.providerId : null,
      })

      if (!result.ok) console.error(`[mail] ${r.email} への送信に失敗しました`, result.error)
    }

    const message =
      skipped > 0 ? `送信設定が未完了のため見送りました（${skipped}件を記録）`
      : failed > 0 ? `${sent}件送信、${failed}件失敗`
      : `${sent}件送信しました`

    return { sent, failed, skipped, noRecipients: false, message }
  } catch (e) {
    // ここで投げると出荷の取り込みまで失敗する。絶対に外へ出さない
    console.error('[mail] 発送完了メールの処理で例外が発生しました', e)
    return none('メール送信で想定外のエラーが起きました')
  }
}
