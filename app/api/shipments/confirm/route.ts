import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendShippedMail } from '@/lib/notifyCustomer'

/**
 * 画面で確認したものだけを取り込み、発送完了メールを送る。
 *
 * 1件ずつ独立して処理する。1件が失敗しても残りは進める。
 * 順番は「記録 → ステータス → メール」。
 * メールが送れなくても出荷の記録は残す（記録が無いと二重送信の判断ができない）。
 */

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

/** 出荷済みにしてよいステータス。取り消し済みや出荷済みは進めない */
const ADVANCEABLE = ['pending', 'confirmed', 'preparing']

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** '2026-09-17' → '2026年9月17日(木)' */
function formatDateJpFull(iso: string): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso ?? ''
  const d = new Date(`${iso}T00:00:00+09:00`)
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日(${WEEKDAYS[d.getDay()]})`
}

type Item = {
  orderId: string
  trackingNumber: string
  carrier: string
  shippedOn: string | null
  raw?: Record<string, string>
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const items: Item[] = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return NextResponse.json({ error: '取り込む行が選ばれていません。' }, { status: 400 })
  }

  const results: {
    orderId: string
    orderNumber: string
    ok: boolean
    message: string
    mailMessage: string
  }[] = []

  for (const item of items) {
    const fail = (orderNumber: string, message: string) =>
      results.push({ orderId: item.orderId, orderNumber, ok: false, message, mailMessage: '' })

    const trackingNumber = String(item.trackingNumber ?? '').replace(/[\s-]/g, '')
    const carrier = String(item.carrier ?? '').trim()

    if (!trackingNumber) { fail('', 'お問合せ番号がありません'); continue }
    if (!carrier) { fail('', '配送業者が選ばれていません'); continue }

    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, customer_id, customer_name, product_name, quantity, shipping_name, shipping_contact, shipping_date, time_slot, status')
      .eq('id', item.orderId)
      .maybeSingle()

    if (!order) { fail('', '受注が見つかりませんでした'); continue }
    if (order.status === 'cancelled') {
      fail(order.order_number, 'キャンセル済みのため取り込みませんでした')
      continue
    }

    // --- 1. 出荷の記録 ---
    const { error: insertError } = await supabase.from('order_shipments').insert({
      order_id: order.id,
      order_number: order.order_number,
      carrier,
      tracking_number: trackingNumber,
      shipped_on: item.shippedOn ?? null,
      source_row: item.raw ?? null,
    })

    if (insertError) {
      // 23505 = 同じ注文に同じ番号が既にある。二重送信を防ぐためここで止める
      if (insertError.code === '23505') {
        fail(order.order_number, 'この番号は取り込み済みです（メールは送っていません）')
      } else {
        console.error('[shipments] 記録に失敗しました', insertError)
        fail(order.order_number, `記録に失敗しました: ${insertError.message}`)
      }
      continue
    }

    // --- 2. ステータス ---
    // 既に出荷済みでも記録は残す。ステータスは進められるものだけ進める
    let statusNote = ''
    if (ADVANCEABLE.indexOf(order.status) >= 0) {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'shipped' })
        .eq('id', order.id)
      if (updateError) {
        console.error('[shipments] ステータスの更新に失敗しました', updateError)
        statusNote = '（ステータスは更新できませんでした）'
      }
    } else {
      statusNote = `（ステータスは ${order.status} のままです）`
    }

    // --- 3. メール ---
    // 送れなくても上の記録は残す。記録が無いと二重取り込みを防げない
    const mail = await sendShippedMail({
      orderId: order.id,
      orderNumber: order.order_number,
      customerId: order.customer_id,
      customerName: (order.customer_name ?? '').trim(),
      productName: order.product_name ?? '',
      quantity: order.quantity ?? 0,
      addressLabel: order.shipping_name ?? '',
      contactName: order.shipping_contact ?? '',
      deliveryDateLabel: formatDateJpFull(order.shipping_date),
      timeSlot: order.time_slot ?? '指定無し',
      carrier,
      trackingNumber,
    })

    results.push({
      orderId: order.id,
      orderNumber: order.order_number,
      ok: true,
      message: `取り込みました${statusNote}`,
      mailMessage: mail.message,
    })
  }

  return NextResponse.json({
    results,
    imported: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
  })
}
