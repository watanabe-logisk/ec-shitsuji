import { ShipmentRow, detectCarrier, Carrier } from '@/lib/wms'

/**
 * WMS の出荷実績CSVの行を、こちらの受注に突き合わせる。
 *
 * DBに触らない純粋な関数だけを置く。判定の理屈をテストできるようにするため。
 * 実際の取り込みは app/api/shipments/ が受け持つ。
 *
 * 照合の順番:
 *   1. 注文番号が完全に一致
 *   2. WMS側の注文番号にこちらの番号が含まれる（NES-MEG-260901001 のような形）
 *   3. どちらでもなければ「一致せず」。画面で人に選んでもらう
 *
 * 推測で決めないのが要点。番号を取り違えると、A社の追跡番号をB社に送る
 * ことになる。曖昧なら必ず人に返す。
 */

export type OrderLite = {
  id: string
  order_number: string
  customer_id: string | null
  customer_name: string
  shipping_name: string
  shipping_contact: string | null
  shipping_date: string
  quantity: number
  status: string
}

export type MatchKind =
  | 'exact'      // 注文番号が完全一致
  | 'contained'  // WMS側の番号にこちらの番号が含まれる
  | 'none'       // 一致せず

export type RowResult = {
  row: ShipmentRow
  kind: MatchKind
  order: OrderLite | null
  carrier: Carrier | null
  /** 一致しなかった行に対する候補。人が選ぶためのもの */
  candidates: OrderLite[]
  /** 取り込めない理由。null なら取り込める */
  blocked: string | null
}

function flatten(s: string): string {
  return (s ?? '').replace(/[\s\u3000]/g, '').toLowerCase()
}

/** 会社名の表記ゆれを吸収して比べる。候補を出すためだけに使う */
export function looksLikeSameParty(a: string, b: string): boolean {
  const x = flatten(a).replace(/(株式会社|有限会社|合同会社)/g, '')
  const y = flatten(b).replace(/(株式会社|有限会社|合同会社)/g, '')
  if (!x || !y) return false
  return x.indexOf(y) >= 0 || y.indexOf(x) >= 0
}

/**
 * 1行の照合先を決める。
 *
 * 完全一致を最優先する。含まれる判定は、複数の受注に当てはまってしまった場合は
 * 使わない（どれか1つに決められないため）。
 */
export function findOrderForRow(row: ShipmentRow, orders: OrderLite[]): {
  kind: MatchKind
  order: OrderLite | null
} {
  const wms = flatten(row.orderNumber)
  if (!wms) return { kind: 'none', order: null }

  const exact = orders.filter(o => flatten(o.order_number) === wms)
  if (exact.length === 1) return { kind: 'exact', order: exact[0] }

  // 番号が空でない受注のうち、WMS側の番号に含まれるもの
  const contained = orders.filter(o => {
    const n = flatten(o.order_number)
    return n.length >= 6 && wms.indexOf(n) >= 0
  })
  if (contained.length === 1) return { kind: 'contained', order: contained[0] }

  return { kind: 'none', order: null }
}

/** 一致しなかった行に出す候補。発送先名と出荷日が近いものを上から */
export function candidatesForRow(row: ShipmentRow, orders: OrderLite[]): OrderLite[] {
  const open = orders.filter(o => o.status !== 'cancelled' && o.status !== 'shipped' && o.status !== 'completed')
  const named = open.filter(
    o => looksLikeSameParty(o.shipping_name, row.shipToName) ||
         looksLikeSameParty(o.customer_name, row.shipToName),
  )
  const pool = named.length > 0 ? named : open

  // 出荷日に近い順。出荷日が読めなければ納品日の新しい順
  const base = row.shippedOn ? new Date(row.shippedOn).getTime() : null
  return pool
    .slice()
    .sort((a, b) => {
      if (base === null) return a.shipping_date < b.shipping_date ? 1 : -1
      const da = Math.abs(new Date(a.shipping_date).getTime() - base)
      const db = Math.abs(new Date(b.shipping_date).getTime() - base)
      return da - db
    })
    .slice(0, 5)
}

/**
 * その行を取り込めない理由を返す。取り込めるなら null。
 *
 * 「まだ取り込めるが注意が要る」ものはここでは止めない。
 * 止めるのは、取り込むと明らかに間違いになるものだけ。
 */
export function blockedReason(row: ShipmentRow, order: OrderLite | null): string | null {
  if (!row.trackingNumber) return 'お問合せ番号が空です'
  if (!order) return null                       // 未一致は画面で選んでもらう
  if (order.status === 'cancelled') return 'この受注はキャンセル済みです'
  return null
}

export function buildRowResult(row: ShipmentRow, orders: OrderLite[]): RowResult {
  const { kind, order } = findOrderForRow(row, orders)
  return {
    row,
    kind,
    order,
    carrier: detectCarrier(row.trackingNumber),
    candidates: order ? [] : candidatesForRow(row, orders),
    blocked: blockedReason(row, order),
  }
}
