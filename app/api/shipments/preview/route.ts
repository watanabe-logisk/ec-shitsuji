import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseShipmentCsv, WmsCsvError } from '@/lib/wms'
import { buildRowResult, OrderLite } from '@/lib/shipmentMatch'

/**
 * 出荷実績CSVを読んで、こちらの受注との照合結果を返すだけ。
 *
 * ここでは何も保存しない。人が画面で確認して confirm を押したときに初めて
 * 書き込む。番号を取り違えると他社の追跡番号を送ることになるため、
 * 取り込みとメール送信を人の確認なしに走らせない。
 */

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'CSVファイルを選んでください。' }, { status: 400 })
  }

  let rows
  try {
    rows = parseShipmentCsv(Buffer.from(await file.arrayBuffer()))
  } catch (e) {
    const message = e instanceof WmsCsvError ? e.message : 'CSVを読み取れませんでした。'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_number, customer_id, customer_name, shipping_name, shipping_contact, shipping_date, quantity, status')
    .order('shipping_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = (orders ?? []) as OrderLite[]
  const results = rows.map(r => buildRowResult(r, list))

  // 既に取り込み済みの番号は、二重に送らないよう印を付ける
  const orderIds = results.map(r => r.order?.id).filter((v): v is string => !!v)
  const already = new Set<string>()
  if (orderIds.length > 0) {
    const { data: shipped } = await supabase
      .from('order_shipments')
      .select('order_id, tracking_number')
      .in('order_id', orderIds)
    for (const s of shipped ?? []) already.add(`${s.order_id}:${s.tracking_number}`)
  }

  return NextResponse.json({
    fileName: file.name,
    rows: results.map(r => ({
      lineNo: r.row.lineNo,
      orderNumber: r.row.orderNumber,
      trackingNumber: r.row.trackingNumber,
      shippedOn: r.row.shippedOn,
      shipToName: r.row.shipToName,
      kind: r.kind,
      carrier: r.carrier,
      blocked: r.blocked,
      alreadyImported: r.order ? already.has(`${r.order.id}:${r.row.trackingNumber}`) : false,
      order: r.order && {
        id: r.order.id,
        orderNumber: r.order.order_number,
        customerName: r.order.customer_name,
        shippingName: r.order.shipping_name,
        shippingDate: r.order.shipping_date,
        quantity: r.order.quantity,
        status: r.order.status,
      },
      candidates: r.candidates.map(o => ({
        id: o.id,
        orderNumber: o.order_number,
        customerName: o.customer_name,
        shippingName: o.shipping_name,
        shippingDate: o.shipping_date,
        quantity: o.quantity,
      })),
      raw: r.row.raw,
    })),
  })
}
