/**
 * 受注ステータスの定義。ラベル・配色・並び順をここ1箇所に集約する。
 *
 * 以前は各画面が `status === 'shipped' ? '出荷済み' : '出荷待ち'` のように
 * 二値で判定していたため、pending / shipped 以外の状態を追加すると
 * 「キャンセル済みの注文が出荷待ちと表示される」という危険な状態になっていた。
 *
 * 既存の pending / shipped のラベルと配色は従来のままにしてあるので、
 * 現在運用中の画面の見た目は変わらない。
 */

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'shipped',
  'completed',
  'cancelled',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

type StatusMeta = {
  label: string
  /** 一覧の並び順。小さいほど上。以前の「pending が先、shipped が後」を保つ */
  rank: number
  /** バッジの配色 */
  className: string
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  // 以下2つは従来と同じラベル・同じ配色。見た目を変えないこと
  pending:   { label: '出荷待ち', rank: 0, className: 'bg-champagne-light text-champagne-dark' },
  confirmed: { label: '受注確定', rank: 1, className: 'bg-warm-200 text-ink' },
  preparing: { label: '準備中',   rank: 2, className: 'bg-warm-200 text-stone' },
  shipped:   { label: '出荷済み', rank: 3, className: 'bg-sage-light text-sage' },
  completed: { label: '完了',     rank: 4, className: 'bg-sage text-warm-50' },
  // キャンセルは一覧の最下部へ。以前は辞書順で先頭に来てしまっていた
  cancelled: { label: 'キャンセル', rank: 5, className: 'bg-red-50 text-red-700' },
}

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
}

/** DB に想定外の値が入っていても画面を壊さない */
export function statusLabel(status: string): string {
  return isOrderStatus(status) ? ORDER_STATUS_META[status].label : status
}

export function statusClassName(status: string): string {
  return isOrderStatus(status)
    ? ORDER_STATUS_META[status].className
    : 'bg-warm-200 text-stone'
}

/** 未知の値は末尾に寄せる */
export function statusRank(status: string): number {
  return isOrderStatus(status) ? ORDER_STATUS_META[status].rank : 99
}

/** 出荷作業がまだ必要な状態か */
export function isOpenStatus(status: string): boolean {
  return status === 'pending' || status === 'confirmed' || status === 'preparing'
}
