'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Order } from '@/types'

function calcShipDate(shippingDate: string, extraDays = 0): string {
  if (!shippingDate) return ''
  const date = new Date(shippingDate)
  let subtracted = 0
  while (subtracted < 2 + extraDays) {
    date.setDate(date.getDate() - 1)
    const d = date.getDay()
    if (d !== 0 && d !== 6) subtracted++
  }
  const m = date.getMonth() + 1
  const day = date.getDate()
  const week = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()]
  return `${m}/${day}(${week})`
}

export default function OrderList() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [exporting, setExporting] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

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

  function toggleAll() {
    setSelected(selected.size === orders.length ? new Set() : new Set(orders.map(o => o.id)))
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
  }

  const filterLabels: Record<string, string> = {
    '': 'すべて',
    pending: '出荷待ち',
    shipped: '出荷済み',
  }

  return (
    <>
      <div className={selected.size > 0 ? 'pb-20' : ''}>
        {/* フィルター */}
        <div className="flex gap-1 mb-5">
          {(['', 'pending', 'shipped'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 text-xs tracking-widest uppercase transition-colors ${
                statusFilter === s
                  ? 'bg-navy text-warm-50'
                  : 'bg-warm-50 text-stone border border-warm-300 hover:border-champagne hover:text-champagne'
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
          <div className="bg-warm-50 border border-warm-300">
            <table className="w-full text-sm">
              <thead className="border-b border-warm-300">
                <tr>
                  <th className="px-4 py-3 text-left w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === orders.length && orders.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs tracking-widest text-stone uppercase font-normal">注文番号</th>
                  <th className="px-4 py-3 text-left text-xs tracking-widest text-stone uppercase font-normal">得意先</th>
                  <th className="px-4 py-3 text-left text-xs tracking-widest text-stone uppercase font-normal">商品</th>
                  <th className="px-4 py-3 text-left text-xs tracking-widest text-stone uppercase font-normal">個数</th>
                  <th className="px-4 py-3 text-left text-xs tracking-widest text-stone uppercase font-normal">出荷予定日</th>
                  <th className="px-4 py-3 text-left text-xs tracking-widest text-stone uppercase font-normal">配送指定日</th>
                  <th className="px-4 py-3 text-left text-xs tracking-widest text-stone uppercase font-normal">状態</th>
                  <th className="px-4 py-3 text-left text-xs tracking-widest text-stone uppercase font-normal">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-200">
                {orders.map(order => {
                  const isProcessing = processingId === order.id
                  return (
                    <tr key={order.id} className={`hover:bg-warm-100 transition-colors ${selected.has(order.id) ? 'bg-champagne-light' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(order.id)}
                          onChange={() => toggleSelect(order.id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-stone text-sm tabular-nums">
                        {order.order_number}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">{order.customer_name}</td>
                      <td className="px-4 py-3 text-stone text-sm">{order.product_name}</td>
                      <td className="px-4 py-3 text-stone text-sm">{order.quantity}</td>
                      <td className="px-4 py-3 text-sm">
                        {calcShipDate(order.shipping_date, order.alert_extra_days || 0)
                          ? (
                            <span className="text-champagne-dark font-medium">
                              {calcShipDate(order.shipping_date, order.alert_extra_days || 0)}
                              {(order.alert_extra_days || 0) > 0 && (
                                <span className="ml-1 text-xs bg-champagne-light text-champagne-dark px-1 py-0.5">延長</span>
                              )}
                            </span>
                          )
                          : <span className="text-stone">—</span>}
                      </td>
                      <td className="px-4 py-3 text-stone text-sm">{order.shipping_date}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 text-xs tracking-wide ${
                          order.status === 'shipped'
                            ? 'bg-sage-light text-sage'
                            : 'bg-champagne-light text-champagne-dark'
                        }`}>
                          {order.status === 'shipped' ? '出荷済み' : '出荷待ち'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isProcessing ? (
                          <span className="text-xs text-stone">処理中...</span>
                        ) : (
                          <div className="flex items-center gap-3">
                            {order.status === 'pending' && (
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
                  {selectedOrder?.status === 'shipped' && (
                    <button
                      onClick={handleRevertStatus}
                      className="border border-stone text-stone text-xs tracking-widest uppercase px-5 py-2 hover:bg-stone hover:text-white transition-colors"
                    >
                      出荷待ちに戻す
                    </button>
                  )}
                </>
              )
            })()}
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="border border-sage text-sage text-xs tracking-widest uppercase px-5 py-2 hover:bg-sage hover:text-white transition-colors disabled:opacity-40"
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
              className="text-xs text-stone hover:text-warm-50 transition-colors tracking-widest uppercase"
            >
              解除
            </button>
          </div>
        </div>
      )}
    </>
  )
}
