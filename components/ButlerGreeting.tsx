'use client'

import { useEffect, useState } from 'react'
import { Order } from '@/types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Link from 'next/link'

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const d = result.getDay()
    if (d !== 0 && d !== 6) added++
  }
  return result
}

export default function ButlerGreeting() {
  const [alertOrders, setAlertOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const alertDate = format(addBusinessDays(new Date(), 2), 'yyyy-MM-dd')

  useEffect(() => {
    fetch(`/api/orders?date=${alertDate}&status=pending`)
      .then(r => r.json())
      .then(data => {
        setAlertOrders(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [alertDate])

  function getGreeting() {
    const h = new Date().getHours()
    if (h < 12) return 'おはようございます。'
    if (h < 18) return 'こんにちは。'
    return 'お疲れ様です。'
  }

  const todayLabel = format(new Date(), 'yyyy年M月d日（E）', { locale: ja })
  const alertDateLabel = format(addBusinessDays(new Date(), 2), 'M月d日（E）', { locale: ja })

  return (
    <div className="relative bg-warm-50 border border-warm-300 shadow-sm overflow-hidden mb-8">
      {/* 透かし🐑 */}
      <div
        className="absolute -right-4 -bottom-6 text-[160px] leading-none select-none pointer-events-none"
        style={{ opacity: 0.04 }}
        aria-hidden
      >
        🐑
      </div>

      <div className="p-8 md:p-10">
        {/* 日付 */}
        <p className="text-xs tracking-[0.25em] text-stone uppercase mb-8">
          {todayLabel}
        </p>

        {/* 挨拶 */}
        <h2 className="text-2xl font-light text-ink mb-8 tracking-wide">
          {getGreeting()}
        </h2>

        {/* 件数 */}
        {loading ? (
          <div className="h-20 flex items-center">
            <div className="w-1 h-8 bg-warm-300 animate-pulse rounded" />
          </div>
        ) : alertOrders.length === 0 ? (
          <p className="text-stone text-sm tracking-wide mb-8">
            本日出荷が必要な案件はございません。
          </p>
        ) : (
          <div className="mb-8">
            <p className="text-xs tracking-[0.2em] text-stone uppercase mb-1">
              本日出荷が必要な件数
            </p>
            <p className="text-xs text-champagne-dark mb-3">
              （配送指定日：{alertDateLabel} の注文）
            </p>
            <div className="flex items-end gap-4 mb-1">
              <span className="font-display font-light text-champagne leading-none" style={{ fontSize: '5rem' }}>
                {alertOrders.length}
              </span>
              <div className="pb-2">
                <div className="border-t border-champagne w-10 mb-2" />
                <span className="text-ink text-sm">件</span>
              </div>
            </div>
          </div>
        )}

        {/* 受注リスト */}
        {!loading && alertOrders.length > 0 && (
          <div className="space-y-2 mb-8">
            {alertOrders.map(order => (
              <div
                key={order.id}
                className="flex items-center justify-between border-l-2 border-champagne pl-4 py-1.5"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-ink truncate block">
                    {order.customer_name}
                  </span>
                  <span className="text-xs text-stone">
                    {order.product_name} × {order.quantity}
                  </span>
                </div>
                <span className="text-xs text-champagne-dark font-medium ml-4 shrink-0">
                  配送 {order.shipping_date}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* アクション */}
        <div className="flex gap-3 pt-6 border-t border-warm-300">
          <Link
            href="/orders/new"
            className="bg-navy text-warm-50 px-6 py-2.5 text-xs tracking-widest uppercase hover:opacity-90 transition-opacity"
          >
            + 受注登録
          </Link>
          <Link
            href="/orders"
            className="border border-warm-300 text-stone px-6 py-2.5 text-xs tracking-widest uppercase hover:border-champagne hover:text-champagne transition-colors"
          >
            受注一覧
          </Link>
        </div>
      </div>
    </div>
  )
}
