'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Navbar from '@/components/Navbar'
import OrderForm from '@/components/OrderForm'
import { Order } from '@/types'

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then(r => r.json())
      .then(data => {
        setOrder(data)
        setLoading(false)
      })
  }, [id])

  return (
    <div className="min-h-screen bg-warm-100">
      <Navbar />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-6">
          <p className="text-xs tracking-[0.25em] text-stone uppercase">受注修正</p>
          {order && (
            <span className="text-xs font-display text-stone tracking-wider">
              #{order.order_number}
            </span>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-warm-300 border-t-champagne rounded-full animate-spin" />
          </div>
        ) : order ? (
          <OrderForm orderId={id} initialData={order} />
        ) : (
          <p className="text-stone text-sm">受注データが見つかりません</p>
        )}
      </main>
    </div>
  )
}
