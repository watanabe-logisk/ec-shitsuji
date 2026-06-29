'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Customer, ParsedEmail, Order } from '@/types'
import { PRODUCTS, TIME_SLOTS } from '@/lib/products'
import EmailParser from './EmailParser'

const inputClass = 'w-full border border-warm-300 bg-warm-100 px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-champagne transition-colors'
const labelClass = 'block text-xs tracking-widest text-stone uppercase mb-1.5'

type Props = {
  orderId?: string
  initialData?: Partial<Order>
}

export default function OrderForm({ orderId, initialData }: Props) {
  const router = useRouter()
  const isEdit = !!orderId
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [customerId, setCustomerId] = useState(initialData?.customer_id ?? '')
  const [productId, setProductId] = useState(() => {
    if (!initialData?.product_code) return ''
    return PRODUCTS.find(p => p.csvCode === initialData.product_code)?.id ?? ''
  })
  const [quantity, setQuantity] = useState(initialData?.quantity ?? 1)
  const [shippingDate, setShippingDate] = useState(initialData?.shipping_date ?? '')
  const [timeSlot, setTimeSlot] = useState(initialData?.time_slot ?? '指定無し')
  const [notes, setNotes] = useState(initialData?.notes ?? '')

  const [useCustomAddress, setUseCustomAddress] = useState(false)
  const [shippingName, setShippingName] = useState(initialData?.shipping_name ?? '')
  const [shippingContact, setShippingContact] = useState(initialData?.shipping_contact ?? '')
  const [shippingPostal, setShippingPostal] = useState(initialData?.shipping_postal_code ?? '')
  const [shippingAddress, setShippingAddress] = useState(initialData?.shipping_address ?? '')
  const [shippingPhone, setShippingPhone] = useState(initialData?.shipping_phone ?? '')

  useEffect(() => {
    fetch('/api/customers').then(r => r.json()).then(data => {
      setCustomers(Array.isArray(data) ? data : [])
    })
  }, [])

  function handleCustomerChange(id: string) {
    setCustomerId(id)
    const c = customers.find(c => c.id === id)
    if (c) {
      setShippingName(c.name)
      setShippingContact(c.contact_name)
      setShippingPostal(c.postal_code)
      setShippingAddress(c.address)
      setShippingPhone(c.phone)
    }
  }

  function handleParsed(data: ParsedEmail) {
    if (data.company_name) {
      const matched = customers.find(c =>
        c.name.includes(data.company_name!) || data.company_name!.includes(c.name)
      )
      if (matched) {
        handleCustomerChange(matched.id)
      } else {
        setShippingName(data.company_name)
      }
    }
    if (data.contact_name) setShippingContact(data.contact_name)
    if (data.postal_code) setShippingPostal(data.postal_code)
    if (data.address) setShippingAddress(data.address)
    if (data.phone) setShippingPhone(data.phone)
    if (data.quantity) setQuantity(data.quantity)
    if (data.shipping_date) setShippingDate(data.shipping_date)
    if (data.postal_code || data.address) setUseCustomAddress(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const product = PRODUCTS.find(p => p.id === productId)
    const customer = customers.find(c => c.id === customerId)
    const body = {
      customer_id: customerId || null,
      customer_name: useCustomAddress ? shippingName : (customer?.name ?? shippingName),
      product_name: product?.name ?? '',
      product_code: product?.csvCode ?? '',
      quantity,
      shipping_date: shippingDate,
      shipping_name: shippingName,
      shipping_contact: shippingContact,
      shipping_postal_code: shippingPostal,
      shipping_address: shippingAddress,
      shipping_phone: shippingPhone,
      time_slot: timeSlot,
      notes,
    }

    const url = isEdit ? `/api/orders/${orderId}` : '/api/orders'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      setSuccess(true)
      setTimeout(() => router.push('/orders'), 1200)
    } else {
      alert(isEdit ? '更新に失敗しました' : '登録に失敗しました')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="bg-warm-50 border border-warm-300 p-16 text-center">
        <div className="text-4xl mb-4">🐑</div>
        <p className="text-lg font-light text-ink tracking-wide">
          {isEdit ? '受注を更新いたしました' : '受注を登録いたしました'}
        </p>
        <p className="text-xs text-stone mt-2 tracking-widest uppercase">受注一覧へ移動します</p>
      </div>
    )
  }

  const selectedCustomer = customers.find(c => c.id === customerId)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!isEdit && <EmailParser onParsed={handleParsed} />}

      {/* 得意先・配送先 */}
      <div className="bg-warm-50 border border-warm-300 p-6">
        <p className="text-xs tracking-[0.2em] text-stone uppercase mb-5">得意先・配送先</p>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>得意先</label>
            <select
              value={customerId}
              onChange={e => handleCustomerChange(e.target.value)}
              className={inputClass}
            >
              <option value="">-- 得意先を選択 --</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {selectedCustomer && (
            <div className="border-l-2 border-champagne pl-4 py-2 text-xs text-stone space-y-0.5">
              <p>〒{selectedCustomer.postal_code}　{selectedCustomer.address}</p>
              <p>{selectedCustomer.contact_name}　{selectedCustomer.phone}</p>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomAddress}
                  onChange={e => setUseCustomAddress(e.target.checked)}
                />
                <span>今回は別の住所に送る</span>
              </label>
            </div>
          )}

          {(!selectedCustomer || useCustomAddress) && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>会社名</label>
                  <input value={shippingName} onChange={e => setShippingName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>担当者名</label>
                  <input value={shippingContact} onChange={e => setShippingContact(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>郵便番号</label>
                  <input value={shippingPostal} onChange={e => setShippingPostal(e.target.value)} placeholder="000-0000" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>電話番号</label>
                  <input value={shippingPhone} onChange={e => setShippingPhone(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>住所</label>
                <input value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} className={inputClass} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 商品・出荷 */}
      <div className="bg-warm-50 border border-warm-300 p-6">
        <p className="text-xs tracking-[0.2em] text-stone uppercase mb-5">商品・出荷情報</p>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>商品 <span className="text-champagne">*</span></label>
            <select value={productId} onChange={e => setProductId(e.target.value)} required className={inputClass}>
              <option value="">-- 商品を選択 --</option>
              {PRODUCTS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>個数 <span className="text-champagne">*</span></label>
              <input
                type="number" min={1} value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                required className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>配送指定日 <span className="text-champagne">*</span></label>
              <input
                type="date" value={shippingDate}
                onChange={e => setShippingDate(e.target.value)}
                required className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>時間帯指定</label>
            <select value={timeSlot} onChange={e => setTimeSlot(e.target.value)} className={inputClass}>
              {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>備考</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-warm-300 bg-warm-100 px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-champagne transition-colors resize-none"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-navy text-warm-50 py-4 text-xs tracking-widest uppercase font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {loading ? '処理中...' : isEdit ? '更新する' : '受注を登録する'}
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={() => router.push('/orders')}
            className="border border-warm-300 text-stone px-6 py-4 text-xs tracking-widest uppercase hover:border-champagne hover:text-champagne transition-colors"
          >
            キャンセル
          </button>
        )}
      </div>
    </form>
  )
}
