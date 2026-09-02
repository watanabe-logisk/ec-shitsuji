'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Order } from '@/types'
import { alertDateLabel } from '@/lib/shipping'
import { isOpenStatus, statusClassName, statusLabel } from '@/lib/status'

/**
 * 出荷済みを配送指定日の月ごとにまとめる。
 *
 * 受注が増えると出荷済みが一覧を埋めてしまい、これから出す分が見えなくなる。
 * 出荷済みは「終わったもの」なので、月ごとに畳んで下に置く。
 * 消したり別のテーブルへ移したりはしない。畳んでいるだけなので、
 * 開けば今までどおり編集も出荷待ちへの差し戻しもできる。
 */
function monthKeyOf(order: Order): string {
  const m = (order.shipping_date ?? '').match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}` : ''
}

function monthLabel(key: string): string {
  if (!key) return '配送指定日なし'
  const [y, m] = key.split('-')
  return `${Number(y)}年${Number(m)}月`
}

function groupByMonth(orders: Order[]): { key: string; label: string; orders: Order[] }[] {
  const map: Record<string, Order[]> = {}
  for (const o of orders) {
    const k = monthKeyOf(o)
    if (!map[k]) map[k] = []
    map[k].push(o)
  }
  return Object.keys(map)
    .sort((a, b) => {
      // 日付なしは最後に回す
      if (!a) return 1
      if (!b) return -1
      return a < b ? 1 : -1        // 新しい月が上
    })
    .map(key => ({ key, label: monthLabel(key), orders: map[key] }))
}

export default function OrderList() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [exporting, setExporting] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  // 開いている月。既定はすべて畳む
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set())

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const params = statusFilter ? `?status=${statusFilter}` : ''
    const res = await fetch(`/api/orders${params}`)
    const data = await res.json()
    setOrders(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleMonth(key: string) {
    setOpenMonths(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  /** 見えている行だけを対象にする。畳んだ月の分まで選ばれると事故になる */
  function toggleGroup(list: Order[]) {
    const ids = list.map(o => o.id)
    const allChosen = ids.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      for (const id of ids) allChosen ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleShipped(id: string) {
    setProcessingId(id)
    await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'shipped' }),
    })
    await fetchOrders()
    setProcessingId(null)
  }

  async function handleRevertStatus() {
    const id = Array.from(selected)[0]
    await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending' }),
    })
    setSelected(new Set())
    await fetchOrders()
  }

  async function handleCopy() {
    const id = Array.from(selected)[0]
    const order = orders.find(o => o.id === id)
    if (!order) return
    const { id: _id, order_number, order_date, created_at, ...rest } = order
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rest),
    })
    if (res.ok) {
      setSelected(new Set())
      await fetchOrders()
    }
  }

  async function handleCancel() {
    const id = Array.from(selected)[0]
    const order = orders.find(o => o.id === id)
    if (!order) return
    if (!confirm(`${order.customer_name} の受注 ${order.order_number} をキャンセルしますか？
（受注データは削除されず、状態がキャンセルになります）`)) return
    await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    setSelected(new Set())
    await fetchOrders()
  }

  async function handleDeleteSelected() {
    const count = selected.size
    if (!confirm(`選択した${count}件の受注を削除しますか？`)) return
    for (const id of Array.from(selected)) {
      await fetch(`/api/orders/${id}`, { method: 'DELETE' })
    }
    setSelected(new Set())
    await fetchOrders()
  }

  async function handleExportCSV() {
    if (selected.size === 0) return
    // キャンセル済みの受注をそのまま配送業者へ流すと誤出荷になる
    const cancelled = orders.filter(o => selected.has(o.id) && o.status === 'cancelled')
    if (cancelled.length > 0) {
      const list = cancelled.map(o => `${o.order_number} ${o.customer_name}`).join('\n')
      if (!confirm(`キャンセル済みの受注が${cancelled.length}件含まれています。

${list}

このままCSVに出力しますか？`)) return
    }
    setExporting(true)
    const res = await fetch('/api/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected) }),
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)

    // サーバー側で pending / confirmed が「準備中」へ進むので、
    // 再読み込みしないと画面が「出荷待ち」のまま古い状態を映してしまう
    setSelected(new Set())
    await fetchOrders()
  }

  const filterLabels: Record<string, string> = {
    '': 'すべて',
    pending: '出荷待ち',
    preparing: '準備中',
    shipped: '出荷済み',
  }

  const th = 'px-3 py-3 text-left text-xs tracking-widest text-stone uppercase font-normal whitespace-nowrap'

  function table(list: Order[]) {
    return (
      <div className="bg-warm-50 border border-warm-300 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-warm-300">
            <tr>
              <th className="px-3 py-3 text-left w-8">
                <input
                  type="checkbox"
                  checked={list.length > 0 && list.every(o => selected.has(o.id))}
                  onChange={() => toggleGroup(list)}
                />
              </th>
              <th className={th}>注文番号</th>
              <th className={th}>得意先</th>
              <th className={th}>商品</th>
              <th className={th}>個数</th>
              <th className={th}>出荷予定日</th>
              <th className={th}>配送指定日</th>
              <th className={th}>状態</th>
              <th className={th}>操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-200">
            {list.map(order => {
              const isProcessing = processingId === order.id
              return (
                <tr key={order.id} className={`hover:bg-warm-100 transition-colors ${selected.has(order.id) ? 'bg-champagne-light' : ''}`}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(order.id)}
                      onChange={() => toggleSelect(order.id)}
                    />
                  </td>
                  <td className="px-3 py-3 text-stone text-sm tabular-nums">
                    {order.order_number}
                  </td>
                  <td className="px-3 py-3 font-medium text-ink">{order.customer_name}</td>
                  <td className="px-3 py-3 text-stone text-sm">{order.product_name}</td>
                  <td className="px-3 py-3 text-stone text-sm tabular-nums">{order.quantity}</td>
                  <td className="px-3 py-3 text-sm">
                    {(() => {
                      const extra = order.alert_extra_days || 0
                      const label = alertDateLabel(order.shipping_date, extra)
                      if (!label) return <span className="text-stone">—</span>
                      return (
                        <span className="text-champagne-dark font-medium whitespace-nowrap">
                          {label}
                          {extra > 0 && (
                            <span className="ml-1 text-xs bg-champagne-light text-champagne-dark px-1 py-0.5">
                              +{extra}日
                            </span>
                          )}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-3 py-3 text-stone text-sm whitespace-nowrap tabular-nums">{order.shipping_date}</td>
                  <td className="px-3 py-3">
                    {/* 以前は「shipped 以外はすべて出荷待ち」と表示していたため、
                        キャンセル済みの注文が「出荷待ち」に見えて誤出荷を招く状態だった */}
                    <span className={`inline-block whitespace-nowrap px-2.5 py-1 text-xs tracking-wide ${statusClassName(order.status)}`}>
                      {statusLabel(order.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {isProcessing ? (
                      <span className="text-xs text-stone">処理中...</span>
                    ) : (
                      <div className="flex items-center gap-3">
                        {/* CSV出力で pending → preparing へ進むため、
                            pending 決め打ちだと出荷済みにできなくなる */}
                        {isOpenStatus(order.status) && (
                          <button
                            onClick={() => handleShipped(order.id)}
                            className="text-xs text-stone hover:text-sage transition-colors"
                          >
                            出荷済み
                          </button>
                        )}
                        <button
                          onClick={() => router.push(`/orders/${order.id}/edit`)}
                          className="text-xs text-stone hover:text-navy transition-colors"
                        >
                          編集
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const shipped = orders.filter(o => o.status === 'shipped')
  const current = orders.filter(o => o.status !== 'shipped')
  const months = groupByMonth(shipped)

  return (
    <>
      <div className={selected.size > 0 ? 'pb-20' : ''}>
        {/* フィルター */}
        <div className="flex gap-1 mb-5">
          {(['', 'pending', 'preparing', 'shipped'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setSelected(new Set()) }}
              className={`px-4 py-2 text-xs tracking-widest uppercase transition-colors ${
                statusFilter === s
                  ? 'bg-navy text-warm-50'
                  : 'bg-warm-50 text-stone border border-warm-300 hover:border-champagne-dark hover:text-champagne-dark'
              }`}
            >
              {filterLabels[s]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-warm-300 border-t-champagne rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-warm-50 border border-warm-300 p-16 text-center">
            <p className="text-stone text-sm tracking-wide">受注データがありません</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* まだ出していないもの。出荷済みだけを下に分けるので、
                キャンセル済みなどはこれまでどおりここに残す */}
            {current.length > 0 && (
              <div>
                {shipped.length > 0 && (
                  <p className="text-xs tracking-widest text-stone uppercase mb-2">
                    進行中　{current.length}件
                  </p>
                )}
                {table(current)}
              </div>
            )}

            {current.length === 0 && shipped.length > 0 && statusFilter !== 'shipped' && (
              <div className="bg-warm-50 border border-warm-300 p-10 text-center">
                <p className="text-stone text-sm tracking-wide">進行中の受注はありません</p>
              </div>
            )}

            {/* 出荷済みは配送指定日の月ごとに畳む */}
            {shipped.length > 0 && (
              <div>
                <p className="text-xs tracking-widest text-stone uppercase mb-2">
                  出荷済み　{shipped.length}件
                </p>
                <div className="space-y-2">
                  {months.map(g => {
                    const isOpen = openMonths.has(g.key)
                    const chosen = g.orders.filter(o => selected.has(o.id)).length
                    return (
                      <div key={g.key}>
                        <button
                          onClick={() => toggleMonth(g.key)}
                          className="w-full bg-warm-50 border border-warm-300 px-4 py-3 flex items-center gap-3 hover:border-champagne-dark transition-colors text-left"
                        >
                          <span className="text-stone text-xs w-3">{isOpen ? '−' : '+'}</span>
                          <span className="text-ink text-sm">{g.label}</span>
                          <span className="text-xs text-stone tabular-nums">{g.orders.length}件</span>
                          {chosen > 0 && (
                            <span className="text-xs bg-champagne-light text-champagne-dark px-2 py-0.5 tracking-wide tabular-nums">
                              {chosen}件選択中
                            </span>
                          )}
                        </button>
                        {isOpen && <div className="mt-1">{table(g.orders)}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 下部アクションバー */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-navy border-t border-white/10 px-8 py-4 flex items-center justify-between z-50">
          <span className="text-xs text-warm-400 tracking-widest">
            {selected.size}件選択中
          </span>
          <div className="flex gap-3">
            {selected.size === 1 && (() => {
              const selectedOrder = orders.find(o => selected.has(o.id))
              return (
                <>
                  <button
                    onClick={handleCopy}
                    className="border border-champagne text-champagne text-xs tracking-widest uppercase px-5 py-2 hover:bg-champagne hover:text-navy transition-colors"
                  >
                    コピー
                  </button>
                  {/* preparing も戻せるようにする。CSVを誤って出したときの復旧手段になる */}
                  {(selectedOrder?.status === 'shipped'
                    || selectedOrder?.status === 'cancelled'
                    || selectedOrder?.status === 'preparing') && (
                    <button
                      onClick={handleRevertStatus}
                      className="border border-warm-400 text-warm-400 text-xs tracking-widest uppercase px-5 py-2 hover:bg-warm-400 hover:text-navy transition-colors"
                    >
                      出荷待ちに戻す
                    </button>
                  )}
                  {isOpenStatus(selectedOrder?.status ?? '') && (
                    <button
                      onClick={handleCancel}
                      className="border border-warm-400 text-warm-400 text-xs tracking-widest uppercase px-5 py-2 hover:bg-warm-400 hover:text-navy transition-colors"
                    >
                      キャンセル
                    </button>
                  )}
                </>
              )
            })()}
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="border border-sage-bright text-sage-bright text-xs tracking-widest uppercase px-5 py-2 hover:bg-sage-bright hover:text-navy transition-colors disabled:opacity-40"
            >
              {exporting ? '生成中...' : 'CSV出力'}
            </button>
            <button
              onClick={handleDeleteSelected}
              className="border border-red-400 text-red-400 text-xs tracking-widest uppercase px-5 py-2 hover:bg-red-400 hover:text-white transition-colors"
            >
              削除
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-warm-400 hover:text-warm-50 transition-colors tracking-widest uppercase"
            >
              解除
            </button>
          </div>
        </div>
      )}
    </>
  )
}
