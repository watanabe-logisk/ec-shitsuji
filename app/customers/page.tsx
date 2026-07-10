'use client'

import { useState, useEffect } from 'react'
import Navbar from '@/components/Navbar'
import { Customer } from '@/types'

const inputClass = 'w-full border border-warm-300 bg-warm-100 px-3 py-2 text-sm text-ink focus:outline-none focus:border-champagne-dark transition-colors'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Customer>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/customers').then(r => r.json()).then(data => {
      setCustomers(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }, [])

  function startEdit(c: Customer) {
    setEditingId(c.id)
    setEditData({ ...c })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditData({})
  }

  async function handleSave(id: string) {
    setSaving(true)
    const res = await fetch(`/api/customers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editData),
    })
    if (res.ok) {
      const updated = await res.json()
      setCustomers(prev => prev.map(c => c.id === id ? updated : c))
      setEditingId(null)
    }
    setSaving(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？\n（この得意先に紐づく受注データは残ります）`)) return
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setCustomers(prev => prev.filter(c => c.id !== id))
    }
  }

  return (
    <div className="min-h-screen bg-warm-100">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="text-xs tracking-[0.25em] text-stone uppercase mb-1">得意先マスタ</p>
            <p className="text-xs text-stone">受注登録時に自動追加されます</p>
          </div>
          <span className="text-xs text-stone">{customers.length}社</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-warm-300 border-t-champagne rounded-full animate-spin" />
          </div>
        ) : customers.length === 0 ? (
          <div className="bg-warm-50 border border-warm-300 p-16 text-center">
            <p className="text-stone text-sm">受注を登録すると自動的に得意先が追加されます</p>
          </div>
        ) : (
          <div className="space-y-2">
            {customers.map(c => (
              <div key={c.id} className="bg-warm-50 border border-warm-300">
                {editingId === c.id ? (
                  /* 編集モード */
                  <div className="p-5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs tracking-widest text-stone uppercase mb-1">会社名</label>
                        <input
                          value={editData.name ?? ''}
                          onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs tracking-widest text-stone uppercase mb-1">担当者名</label>
                        <input
                          value={editData.contact_name ?? ''}
                          onChange={e => setEditData(d => ({ ...d, contact_name: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs tracking-widest text-stone uppercase mb-1">郵便番号</label>
                        <input
                          value={editData.postal_code ?? ''}
                          onChange={e => setEditData(d => ({ ...d, postal_code: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs tracking-widest text-stone uppercase mb-1">電話番号</label>
                        <input
                          value={editData.phone ?? ''}
                          onChange={e => setEditData(d => ({ ...d, phone: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs tracking-widest text-stone uppercase mb-1">住所</label>
                      <input
                        value={editData.address ?? ''}
                        onChange={e => setEditData(d => ({ ...d, address: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleSave(c.id)}
                        disabled={saving}
                        className="bg-navy text-warm-50 px-5 py-2 text-xs tracking-widest uppercase hover:opacity-90 transition-opacity disabled:opacity-40"
                      >
                        {saving ? '保存中...' : '保存'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="border border-warm-300 text-stone px-5 py-2 text-xs tracking-widest uppercase hover:border-champagne-dark hover:text-champagne-dark transition-colors"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 表示モード */
                  <div className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-ink text-sm">{c.name}</p>
                      <p className="text-xs text-stone mt-0.5">
                        {c.contact_name && <span className="mr-3">{c.contact_name}</span>}
                        {c.postal_code && <span className="mr-1">〒{c.postal_code}</span>}
                        {c.address && <span className="mr-3">{c.address}</span>}
                        {c.phone && <span>{c.phone}</span>}
                      </p>
                    </div>
                    <div className="flex gap-3 shrink-0">
                      <button
                        onClick={() => startEdit(c)}
                        className="text-xs text-stone hover:text-champagne-dark transition-colors tracking-wide"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(c.id, c.name)}
                        className="text-xs text-stone hover:text-red-400 transition-colors tracking-wide"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
